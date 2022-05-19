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
    }

    processRequest(uuid: string, tokens = 1): boolean {
        throw Error(`TokenBucket.processRequest not implemented, ${this}`);
    }

    /**
     * @returns current size of the token bucket in redis store or CAPACITY if user is not present
     */
    getSize(uuid: string): number {
        throw Error(`TokenBucket.connect not implemented, ${this}`);
    }

    /**
     * Resets the rate limiter to the intial state by clearing the redis store.
     */
    reset(): void {
        throw Error(`TokenBucket.connect not implemented, ${this}`);
    }
}

export default TokenBucket;
