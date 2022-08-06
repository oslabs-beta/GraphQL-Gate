import Redis from 'ioredis';
import { RateLimiter, RateLimiterResponse, RedisBucket } from '../@types/rateLimit';

/**
 * The TokenBucket instance of a RateLimiter limits requests based on a unique user ID.
 * Whenever a user makes a request the following steps are performed:
 *  1. Refill the bucket based on time elapsed since the previous request
 *  2. Update the timestamp of the last request.
 *  3. Allow the request and remove the requested amount of tokens from the bucket if the user has enough.
 *  4. Otherwise, disallow the request and do not update the token total.
 */
class TokenBucket implements RateLimiter {
    private capacity: number;

    private refillRate: number;

    private client: Redis;

    private keyExpiry: number;

    /**
     * Create a new instance of a TokenBucket rate limiter that can be connected to any database store
     * @param capacity max token bucket capacity
     * @param refillRate rate at which the token bucket is refilled
     * @param client redis client where rate limiter will cache information
     * @param expiry redis key expiry in ms
     */
    constructor(capacity: number, refillRate: number, client: Redis, expiry: number) {
        this.capacity = capacity;
        this.refillRate = refillRate;
        this.client = client;
        this.keyExpiry = expiry;
        if (!refillRate || !capacity || refillRate <= 0 || capacity <= 0 || expiry <= 0)
            throw Error('TokenBucket refillRate, capacity and keyExpiry must be positive');
    }

    /**
     *
     *
     * @param {string} uuid - unique identifer used to throttle requests
     * @param {number} timestamp - time the request was recieved
     * @param {number} [tokens=1]  - complexity of the query for throttling requests
     * @return {*}  {Promise<RateLimiterResponse>}
     * @memberof TokenBucket
     */
    async processRequest(
        uuid: string,
        timestamp: number,
        tokens = 1
    ): Promise<RateLimiterResponse> {
        // attempt to get the value for the uuid from the redis cache
        const bucketJSON = await this.client.get(uuid);

        // if the response is null, we need to create a bucket for the user
        if (!bucketJSON) {
            const newUserBucket: RedisBucket = {
                // conditionally set tokens depending on how many are requested comapred to the capacity
                tokens: tokens > this.capacity ? this.capacity : this.capacity - tokens,
                timestamp,
            };
            // reject the request, not enough tokens could even be in the bucket
            if (tokens > this.capacity) {
                await this.client.setex(uuid, this.keyExpiry, JSON.stringify(newUserBucket));
                return {
                    success: false,
                    tokens: this.capacity,
                    retryAfter: Infinity,
                };
            }
            await this.client.setex(uuid, this.keyExpiry, JSON.stringify(newUserBucket));
            return { success: true, tokens: newUserBucket.tokens };
        }

        // parse the returned string from redis and update their token budget based on the time lapse between queries
        const bucket: RedisBucket = await JSON.parse(bucketJSON);
        bucket.tokens = this.calculateTokenBudgetFromTimestamp(bucket, timestamp);

        const updatedUserBucket = {
            // conditionally set tokens depending on how many are requested comapred to the bucket
            tokens: bucket.tokens < tokens ? bucket.tokens : bucket.tokens - tokens,
            timestamp,
        };
        if (bucket.tokens < tokens) {
            // reject the request, not enough tokens in bucket
            await this.client.setex(uuid, this.keyExpiry, JSON.stringify(updatedUserBucket));
            return {
                success: false,
                tokens: bucket.tokens,
                retryAfter:
                    tokens > this.capacity
                        ? Infinity
                        : Math.abs(tokens - bucket.tokens) * this.refillRate,
            };
        }
        await this.client.setex(uuid, this.keyExpiry, JSON.stringify(updatedUserBucket));
        return { success: true, tokens: updatedUserBucket.tokens };
    }

    /**
     * Resets the rate limiter to the intial state by clearing the redis store.
     */
    public reset(): void {
        this.client.flushall();
    }

    /**
     * Calculates the tokens a user bucket should have given the time lapse between requests.
     */
    private calculateTokenBudgetFromTimestamp = (
        bucket: RedisBucket,
        timestamp: number
    ): number => {
        const timeSinceLastQueryInSeconds: number = Math.floor(
            (timestamp - bucket.timestamp) / 1000 // 1000 ms in a second
        );
        const tokensToAdd = timeSinceLastQueryInSeconds * this.refillRate;
        const updatedTokenCount = bucket.tokens + tokensToAdd;
        return updatedTokenCount > this.capacity ? this.capacity : updatedTokenCount;
    };
}

export default TokenBucket;
