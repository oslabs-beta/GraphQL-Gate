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
    capacity: number;

    refillRate: number;

    client: RedisClientType;

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

    async processRequest(
        uuid: string,
        timestamp: number,
        tokens = 1
    ): Promise<RateLimiterResponse> {
        // attempt to get the value for the uuid from the redis cache
        const bucketJSON = await this.client.get(uuid);
        // if the response is null, we need to create bucket for the user
        if (bucketJSON === undefined || bucketJSON === null) {
            if (tokens > this.capacity) {
                // reject the request, not enough tokens in bucket
                return {
                    success: false,
                    tokens: 10,
                };
            }
            const newUserBucket: RedisBucket = {
                tokens: this.capacity - tokens,
                timestamp,
            };
            await this.client.set(uuid, JSON.stringify(newUserBucket));
            return {
                success: true,
                tokens: newUserBucket.tokens,
            };
        }

        const bucket: RedisBucket = await JSON.parse(bucketJSON);

        const timeSinceLastQueryInSeconds: number = Math.min((timestamp - bucket.timestamp) / 60);
        const tokensToAdd = timeSinceLastQueryInSeconds * this.refillRate;
        const updatedTokenCount = bucket.tokens + tokensToAdd;
        bucket.tokens = updatedTokenCount > this.capacity ? 10 : updatedTokenCount;

        if (bucket.tokens < tokens) {
            // reject the request, not enough tokens in bucket
            return {
                success: false,
                tokens: bucket.tokens,
            };
        }
        const updatedUserBucket = {
            tokens: bucket.tokens - tokens,
            timestamp,
        };
        await this.client.set(uuid, JSON.stringify(updatedUserBucket));
        return {
            success: true,
            tokens: updatedUserBucket.tokens,
        };
    }

    /**
     * Resets the rate limiter to the intial state by clearing the redis store.
     */
    reset(): void {
        this.client.flushAll();
    }
}

export default TokenBucket;
