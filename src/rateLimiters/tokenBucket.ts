import Redis from 'ioredis';

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

    /**
     * Create a new instance of a TokenBucket rate limiter that can be connected to any database store
     * @param capacity max token bucket capacity
     * @param refillRate rate at which the token bucket is refilled
     * @param client redis client where rate limiter will cache information
     */
    constructor(capacity: number, refillRate: number, client: Redis) {
        this.capacity = capacity;
        this.refillRate = refillRate;
        this.client = client;
        if (refillRate <= 0 || capacity <= 0)
            throw Error('TokenBucket refillRate and capacity must be positive');
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
        throw Error(`TokenBucket.processRequest not implemented, ${this}`);
    }

    /**
     * Resets the rate limiter to the intial state by clearing the redis store.
     */
    reset(): void {
        throw Error(`TokenBucket.reset not implemented, ${this}`);
    }
}

export default TokenBucket;
