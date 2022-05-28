import { RedisClientType } from 'redis';

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

    private client: RedisClientType;

    /**
     * Create a new instance of a TokenBucket rate limiter that can be connected to any database store
     * @param capacity max token bucket capacity
     * @param refillRate rate at which the token bucket is refilled
     * @param client redis client where rate limiter will cache information
     */
    constructor(capacity: number, refillRate: number, client: RedisClientType) {
        this.capacity = capacity;
        this.refillRate = refillRate;
        this.client = client;
        if (refillRate <= 0 || capacity <= 0)
            throw Error('TokenBucket refillRate and capacity must be positive');
    }

    public async processRequest(
        uuid: string,
        timestamp: number,
        tokens = 1
    ): Promise<RateLimiterResponse> {
        // set the expiry of key-value pairs in the cache to 24 hours
        const keyExpiry = 86400000;

        // attempt to get the value for the uuid from the redis cache
        const bucketJSON = await this.client.get(uuid);
        // if the response is null, we need to create bucket for the user
        if (bucketJSON === null) {
            if (tokens > this.capacity) {
                // reject the request, not enough tokens could even be in the bucket
                // TODO: add key to cache for next request.
                return this.processRequestResponse(false, this.capacity);
            }
            const newUserBucket: RedisBucket = {
                tokens: this.capacity - tokens,
                timestamp,
            };
            await this.client.setEx(uuid, keyExpiry, JSON.stringify(newUserBucket));
            return this.processRequestResponse(true, newUserBucket.tokens);
        }

        // parse the returned thring form redis and update their token budget based on the time lapse between queries
        const bucket: RedisBucket = await JSON.parse(bucketJSON);
        bucket.tokens = this.calculateTokenBudgetFormTimestamp(bucket, timestamp);

        if (bucket.tokens < tokens) {
            // reject the request, not enough tokens in bucket
            // TODO upadte expirey and timestamp despite rejected request
            return this.processRequestResponse(false, bucket.tokens);
        }
        const updatedUserBucket = {
            tokens: bucket.tokens - tokens,
            timestamp,
        };
        await this.client.setEx(uuid, keyExpiry, JSON.stringify(updatedUserBucket));
        return this.processRequestResponse(true, updatedUserBucket.tokens);
    }

    /**
     * Resets the rate limiter to the intial state by clearing the redis store.
     */
    public reset(): void {
        this.client.flushAll();
    }

    /**
     * Calculates the tokens a user bucket should have given the time lapse between requests.
     */
    private calculateTokenBudgetFormTimestamp = (
        bucket: RedisBucket,
        timestamp: number
    ): number => {
        const timeSinceLastQueryInSeconds: number = Math.min((timestamp - bucket.timestamp) / 60);
        const tokensToAdd = timeSinceLastQueryInSeconds * this.refillRate;
        const updatedTokenCount = bucket.tokens + tokensToAdd;
        return updatedTokenCount > this.capacity ? 10 : updatedTokenCount;
    };

    private processRequestResponse = (success: boolean, tokens: number): RateLimiterResponse => {
        return {
            success,
            tokens,
        };
    };
}

export default TokenBucket;
