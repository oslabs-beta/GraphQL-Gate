import Redis from 'ioredis';
import { RateLimiter, RateLimiterResponse, RedisWindow } from '../@types/rateLimit';

/**
 * The FixedWindow instance of a RateLimiter limits requests based on a unique user ID and a fixed time window.
 * Whenever a user makes a request the following steps are performed:
 *  1. Define the time window with fixed amount of queries.
 *  2. Update the timestamp of the last request.
 *  3. Allow the request and decrease the allowed amount of requests if the user has enough at this time window.
 *  4. Otherwise, disallow the request until the next time window opens.
 */

class FixedWindow implements RateLimiter {
    private capacity: number;

    private keyExpiry: number;

    private windowSize: number;

    private client: Redis;

    /**
     * Create a new instance of a FixedWindow rate limiter that can be connected to any database store
     * @param capacity max requests capacity in one time window
     * @param windowSize rate at which the token bucket is refilled
     * @param client redis client where rate limiter will cache information
     */

    constructor(capacity: number, windowSize: number, client: Redis, expiry: number) {
        this.capacity = capacity;
        this.windowSize = windowSize;
        this.client = client;
        this.keyExpiry = expiry;
        if (windowSize <= 0 || capacity <= 0 || expiry <= 0)
            throw Error('FixedWindow windowSize, capacity and keyExpiry must be positive');
    }

    /**
     * @function processRequest - Fixed Window algorithm to allow or block
     * based on the depth/complexity (in amount of tokens) of incoming requests.
     *               Fixed Window
     *     _________________________________
     *    |         *full capacity          |
     *    |                                 |  move to next time window
     *    |    token adds up until full     |       ---------->
     *____._________________________________.____
     *    |<--        window size        -->|
     *current timestamp              next timestamp
     *
     * First, checks if a window exists in the redis cache.
     * If not, then `fixedWindowStart` is set as the current timestamp, and `currentTokens` is checked against `capacity`.
     * If enough room exists for the request, returns success as true and tokens as how many tokens remain in the current fixed window.
     *
     * If a window does exist in the cache, we first check if the timestamp is greater than the fixedWindowStart + windowSize.
     * If it isn't, we update currentToken with the incoming token until reach the capcity
     *
     * @param {string} uuid - unique identifer used to throttle requests
     * @param {number} timestamp - time the request was recieved
     * @param {number} [tokens=1]  - complexity of the query for throttling requests
     * @return {*}  {Promise<RateLimiterResponse>}
     * @memberof FixedWindow
     */
    async processRequest(
        uuid: string,
        timestamp: number,
        tokens = 1
    ): Promise<RateLimiterResponse> {
        // attempt to get the value for the uuid from the redis cache
        const windowJSON = await this.client.get(uuid);

        if (windowJSON === null) {
            const newUserWindow: RedisWindow = {
                currentTokens: tokens > this.capacity ? 0 : tokens,
                fixedWindowStart: timestamp,
            };

            if (tokens > this.capacity) {
                await this.client.setex(uuid, this.keyExpiry, JSON.stringify(newUserWindow));
                return { success: false, tokens: this.capacity, retryAfter: Infinity };
            }
            await this.client.setex(uuid, this.keyExpiry, JSON.stringify(newUserWindow));
            return { success: true, tokens: this.capacity - newUserWindow.currentTokens };
        }
        const window: RedisWindow = await JSON.parse(windowJSON);
        const previousWindowStart = window.fixedWindowStart;
        const updatedUserWindow = this.updateTimeWindow(window, timestamp);
        updatedUserWindow.currentTokens += tokens;
        // update the currentToken until reaches its capacity
        if (updatedUserWindow.currentTokens > this.capacity) {
            updatedUserWindow.currentTokens -= tokens;
            return {
                success: false,
                tokens: this.capacity - updatedUserWindow.currentTokens,
                retryAfter: Math.ceil((this.windowSize - (timestamp - previousWindowStart)) / 1000),
            };
        }

        await this.client.setex(uuid, this.keyExpiry, JSON.stringify(updatedUserWindow));
        return {
            success: true,
            tokens: this.capacity - updatedUserWindow.currentTokens,
        };
    }

    /**
     * Resets the rate limiter to the intial state by clearing the redis store.
     */
    public reset(): void {
        this.client.flushall();
    }

    private updateTimeWindow = (window: RedisWindow, timestamp: number): RedisWindow => {
        const updatedUserWindow: RedisWindow = {
            currentTokens: window.currentTokens,
            fixedWindowStart: window.fixedWindowStart,
        };
        if (timestamp >= window.fixedWindowStart + this.windowSize) {
            if (timestamp >= window.fixedWindowStart + this.windowSize * 2) {
                updatedUserWindow.fixedWindowStart = timestamp;
                updatedUserWindow.currentTokens = 0;
            } else {
                updatedUserWindow.fixedWindowStart = window.fixedWindowStart + this.windowSize;
                updatedUserWindow.currentTokens = 0;
            }
        }
        return updatedUserWindow;
    };
}

export default FixedWindow;
