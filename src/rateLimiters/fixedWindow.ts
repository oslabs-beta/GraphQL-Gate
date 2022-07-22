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

    private windowSize: number;

    private client: Redis;

    /**
     * Create a new instance of a FixedWindow rate limiter that can be connected to any database store
     * @param capacity max requests capacity in one time window
     * @param windowSize rate at which the token bucket is refilled
     * @param client redis client where rate limiter will cache information
     */

    constructor(capacity: number, windowSize: number, client: Redis) {
        this.capacity = capacity;
        this.windowSize = windowSize;
        this.client = client;
        if (windowSize <= 0 || capacity <= 0)
            throw Error('FixedWindow windowSize and capacity must be positive');
    }

    /**
     *               Fixed Window
     *     _________________________________
     *    |         *full capacity          |
     *    |                                 |  move to next time window
     *    |    token adds up until full     |       ---------->
     *____._________________________________.____
     *    |<--        window size        -->|
     *current timestamp              next timestamp
     *
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
        // set the expiry of key-value pairs in the cache to 24 hours
        const keyExpiry = 86400000;

        // attempt to get the value for the uuid from the redis cache
        const windowJSON = await this.client.get(uuid);

        if (windowJSON === null) {
            const newUserWindow: RedisWindow = {
                currentTokens: tokens <= this.capacity ? tokens : 0,
                fixedWindowStart: timestamp,
            };

            if (tokens <= this.capacity) {
                await this.client.setex(uuid, keyExpiry, JSON.stringify(newUserWindow));
                return { success: true, tokens: this.capacity - newUserWindow.currentTokens };
            }

            await this.client.setex(uuid, keyExpiry, JSON.stringify(newUserWindow));
        }

        const window: RedisWindow = await JSON.parse(windowJSON as string);

        const updatedUserWindow = this.updateTimeWindow(window, timestamp);
        if (window.currentTokens > this.capacity) {
            await this.client.setex(uuid, keyExpiry, JSON.stringify(updatedUserWindow));
            return { success: false, tokens: window.currentTokens };
        }
        await this.client.setex(uuid, keyExpiry, JSON.stringify(updatedUserWindow));

        return { success: false, tokens: updatedUserWindow.currentTokens };
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
        if (timestamp > window.fixedWindowStart + this.windowSize) {
            updatedUserWindow.fixedWindowStart = window.fixedWindowStart + this.windowSize;
            updatedUserWindow.currentTokens = 0;
        }
        return updatedUserWindow;
    };
}

export default FixedWindow;
