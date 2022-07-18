import Redis from 'ioredis';
import { RateLimiter, RateLimiterResponse } from '../@types/rateLimit';

/**
 * The SlidingWindowLog instance of a RateLimiter limits requests based on a unique user ID.
 * With the FixedWindow algorithm, users are able to send more requests to go through at the
 * edges of a window. The SlidingWindowLog algorithm addresses this issue by tracking request
 * timestamps in a log then removing these requests from the log once they fall outside of the window.
 * If a request is received and there are more than capacity requests in the log then the request is dropped
 *
 * Whenever a user makes a request the following steps are performed:
 *  1. The user's log is obtained from redis.
 *  2. Any requests that are older than window size are dropped from the log.
 *  3. The complexity of the current request is added to the complexity of all requests in the log.
 *  4. If the request exceeds the specified capacity it is dropped.
 *  5. Otherwise the request is allowed and the current request is added to the end of the log (if it has a complexity > 0).
 */
class SlidingWindowLog implements RateLimiter {
    private windowSize: number;

    private capacity: number;

    private client: Redis;

    /**
     * Create a new instance of a SlidingWindowLog rate limiter that can be connected to any redis store
     * @param windowSize size of window in milliseconds
     * @param capacity max number of tokens allowed in each window
     * @param client redis client where rate limiter will cache information
     */
    constructor(windowSize: number, capacity: number, client: Redis) {
        this.windowSize = windowSize;
        this.capacity = capacity;
        this.client = client;
        if (windowSize <= 0 || capacity <= 0)
            throw SyntaxError('SlidingWindowLog windowSize and capacity must be positive');
    }

    /**
     * @param {string} uuid - unique identifer used to throttle requests
     * @param {number} timestamp - time the request was recieved
     * @param {number} [tokens=1]  - complexity of the query for throttling requests
     * @return {*}  {Promise<RateLimiterResponse>}
     * @memberof SlidingWindowLog
     */
    async processRequest(
        uuid: string,
        timestamp: number,
        tokens = 1
    ): Promise<RateLimiterResponse> {
        // set the expiry of key-value pairs in the cache to 24 hours
        const keyExpiry = 86400000; // TODO: Make this a global for consistency across each algo.
        if (tokens > this.capacity) return { success: false, tokens: this.capacity };

        throw new Error('SlidingWindowLog.processRequest not implemented');
    }

    /**
     * Resets the rate limiter to the intial state by clearing the redis store.
     */
    public reset(): void {
        this.client.flushall();
    }
}

export default SlidingWindowLog;
