import Redis from 'ioredis';
import { RateLimiter, RateLimiterResponse, RedisBucket, RedisLog } from '../@types/rateLimit';

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
            throw SyntaxError('SlidingWindowLog window size and capacity must be positive');

        // TODO: Define lua script for server side computation using either sorted sets or lists
        // while x.timestamp + window_size < timestamp lpop
        // //https://stackoverflow.com/questions/35677682/filtering-deleting-items-from-a-redis-set
        // this.client.defineCommand('popWindow', {
        //     // 2 value timestamp and complexity of this request
        //     lua: `
        //         local totalComplexity = 0 -- complexity of active requests
        //         local expiredMembers = 0 -- number of requests to remove
        //         local key = keys[1] -- uuid
        //         local current_time = keys[2]

        //         for index, value in next, redis.call(key, ????) do
        //             -- string comparisson of timestamps
        //             if .... then

        //             else
        //                 totalComplexity += ????
        //             end
        //         end

        //         redis.call(pop, ???)

        //         if total_complexity < window_size then
        //             then
        //         end
        //         return {

        //         }
        //     `,
        //     numberOfKeys: 3, // uuid
        //     readOnly: true,
        // });
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

        // Each user's log is represented by a redis list with a score = request timestamp
        // and a value equal to the complexity
        // Drop expired requests from the log. represented by a sorted set in redis

        // Get the log from redis
        let requestLog: RedisLog = JSON.parse((await this.client.get(uuid)) || '[]');

        // Iterate through the list in reverse and count active tokens
        // This allows us to track the threshold for when this request would be allowed if it is blocked
        // Stop at the first timestamp that's expired and cut the rest.

        const cutoff = timestamp - this.windowSize;
        let tokensInLog = 0;
        let cutoffIndex = 0; // index of oldest active request
        // TODO: Provide a timestamp for when the request will succeeed.
        // Compute time between response and this timestamp later on
        // FIXME: What should this be if the complexity is too big?
        let retryIndex = requestLog.length; // time the user must wait before a request can be allowed.

        for (let index = requestLog.length - 1; index >= 0; index--) {
            if (cutoff >= requestLog[index].timestamp) {
                cutoffIndex = index + 1;
                break;
            } else {
                // the request is active
                tokensInLog += requestLog[index].tokens;
                if (this.capacity - tokensInLog >= tokens) {
                    // the log is able to accept this request
                    retryIndex = index;
                }
            }
        }

        let retryAfter: number;
        if (tokens > this.capacity) retryAfter = Infinity;
        // need the request before retryIndex
        else if (retryIndex > 0)
            retryAfter = this.windowSize + requestLog[retryIndex - 1].timestamp;
        else retryAfter = 0; // request is allowed

        // Conditional check to avoid unecessary slice
        if (cutoffIndex > 0) requestLog = requestLog.slice(cutoffIndex);

        // allow/disallow current request
        if (tokensInLog + tokens <= this.capacity) {
            // update the log
            if (tokens > 0) requestLog.push({ timestamp, tokens });
            await this.client.setex(uuid, keyExpiry, JSON.stringify(requestLog));
            tokensInLog += tokens;
            return { success: true, tokens: this.capacity - tokensInLog };
        }

        await this.client.setex(uuid, keyExpiry, JSON.stringify(requestLog));

        return { success: false, tokens: this.capacity - tokensInLog, retryAfter };
    }

    /**
     * Resets the rate limiter to the intial state by clearing the redis store.
     */
    public reset(): void {
        this.client.flushall();
    }
}

export default SlidingWindowLog;
