import Redis from 'ioredis';
import { RateLimiter, RateLimiterResponse, RedisWindow } from '../@types/rateLimit';

/**
 * The SlidingWindowCounter instance of a RateLimiter limits requests based on a unique user ID.
 * This algorithm improves upon the FixedWindowCounter because this algorithm prevents fixed window's
 * flaw of allowing doubled capacity requests when hugging the window's borders with a rolling window,
 * allowing us to average the requests between both windows proportionately with the rolling window's
 * takeup in each.
 *
 * Whenever a user makes a request the following steps are performed:
 *  1. Fixed windows are defined along with redis caches if previously undefined.
 *  2. Rolling windows are defined or updated based on the timestamp of the new request.
 *  3. Counter of the current fixed window is updated with the new request's token usage.
 *  4. If a new minute interval is reached, the averaging formula is run to prevent fixed window's flaw
 *     of flooded requests around window borders
 *    (ex. 1m windows, 10 token capacity: 1m59s 10 reqs 2m2s 10 reqs)
 */
class SlidingWindowCounter implements RateLimiter {
    private windowSize: number;

    private capacity: number;

    private client: Redis;

    /**
     * Create a new instance of a SlidingWindowCounter rate limiter that can be connected to any database store
     * @param windowSize size of each window in milliseconds (fixed and rolling)
     * @param capacity max capacity of tokens allowed per fixed window
     * @param client redis client where rate limiter will cache information
     */
    constructor(windowSize: number, capacity: number, client: Redis) {
        this.windowSize = windowSize;
        this.capacity = capacity;
        this.client = client;
        if (windowSize <= 0 || capacity <= 0)
            throw SyntaxError('SlidingWindowCounter windowSize and capacity must be positive');
    }

    /**
     * @function processRequest - Sliding window counter algorithm to allow or block
     * based on the depth/complexity (in amount of tokens) of incoming requests.
     *
     * First, checks if a window exists in the redis cache.
     *
     * If not, then `fixedWindowStart` is set as the current timestamp, and `currentTokens`
     * is checked against `capacity`. If enough room exists for the request, returns
     * success as true and tokens as how many tokens remain in the current fixed window.
     *
     * If a window does exist in the cache, we first check if the timestamp is greater than
     * the fixedWindowStart + windowSize.
     *
     * If it isn't then we check the number of tokens in the arguments as well as in the cache
     * against the capacity and return success or failure from there while updating the cache.
     *
     * If the timestamp is over the windowSize beyond the fixedWindowStart, then we update fixedWindowStart
     * to be fixedWindowStart + windowSize (to create a new fixed window) and
     * make previousTokens = currentTokens, and currentTokens equal to the number of tokens in args, if
     * not over capacity.
     *
     * Once previousTokens is not null, we then run functionality using the rolling window to compute
     * the formula this entire limiting algorithm is distinguished by:
     *
     * currentTokens + previousTokens * overlap % of rolling window over previous fixed window
     *
     * @param {string} uuid - unique identifer used to throttle requests
     * @param {number} timestamp - time the request was recieved
     * @param {number} [tokens=1]  - complexity of the query for throttling requests
     * @return {*}  {Promise<RateLimiterResponse>}
     * RateLimiterResponse: {success: boolean, tokens: number}
     * (tokens represents the remaining available capacity of the window)
     * @memberof SlidingWindowCounter
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

        // if the response is null, we need to create a window for the user
        if (windowJSON === null) {
            const newUserWindow: RedisWindow = {
                // current and previous tokens represent how many tokens are in each window
                currentTokens: tokens <= this.capacity ? tokens : 0,
                previousTokens: 0,
                fixedWindowStart: timestamp,
            };

            if (tokens <= this.capacity) {
                await this.client.setex(uuid, keyExpiry, JSON.stringify(newUserWindow));
                return { success: true, tokens: this.capacity - newUserWindow.currentTokens };
            }

            await this.client.setex(uuid, keyExpiry, JSON.stringify(newUserWindow));
            // tokens property represents how much capacity remains
            return { success: false, tokens: this.capacity };
        }

        // if the cache is populated

        const window: RedisWindow = await JSON.parse(windowJSON);

        const updatedUserWindow: RedisWindow = {
            currentTokens: window.currentTokens,
            previousTokens: window.previousTokens,
            fixedWindowStart: window.fixedWindowStart,
        };

        // if request time is in a new window
        if (window.fixedWindowStart && timestamp >= window.fixedWindowStart + this.windowSize) {
            // if more than one window was skipped
            if (timestamp >= window.fixedWindowStart + this.windowSize * 2) {
                // if one or more windows was skipped, reset new window to be at current timestamp
                updatedUserWindow.previousTokens = 0;
                updatedUserWindow.currentTokens = 0;
                updatedUserWindow.fixedWindowStart = timestamp;
            } else {
                updatedUserWindow.previousTokens = updatedUserWindow.currentTokens;
                updatedUserWindow.currentTokens = 0;
                updatedUserWindow.fixedWindowStart = window.fixedWindowStart + this.windowSize;
            }
        }

        // assigned to avoid TS error, this var will never be used as 0
        // var is declared here so that below can be inside a conditional for efficiency's sake
        let rollingWindowProportion = 0;
        let previousRollingTokens = 0;

        if (updatedUserWindow.fixedWindowStart && updatedUserWindow.previousTokens) {
            // proportion of rolling window present in previous window
            rollingWindowProportion =
                (this.windowSize - (timestamp - updatedUserWindow.fixedWindowStart)) /
                this.windowSize;

            // remove unecessary decimals, 0.xx is enough
            // rollingWindowProportion -= rollingWindowProportion % 0.01;

            // # of tokens present in rolling & previous window
            previousRollingTokens = Math.floor(
                updatedUserWindow.previousTokens * rollingWindowProportion
            );
        }

        // # of tokens present in rolling and/or current window
        // if previous tokens is null, previousRollingTokens will be 0
        const rollingTokens = updatedUserWindow.currentTokens + previousRollingTokens;

        // if request is allowed
        if (tokens + rollingTokens <= this.capacity) {
            updatedUserWindow.currentTokens += tokens;
            await this.client.setex(uuid, keyExpiry, JSON.stringify(updatedUserWindow));
            return {
                success: true,
                tokens: this.capacity - (updatedUserWindow.currentTokens + previousRollingTokens),
            };
        }

        // if request is blocked
        await this.client.setex(uuid, keyExpiry, JSON.stringify(updatedUserWindow));
        return {
            success: false,
            tokens: this.capacity - (updatedUserWindow.currentTokens + previousRollingTokens),
        };
    }

    /**
     * Resets the rate limiter to the intial state by clearing the redis store.
     */
    public reset(): void {
        this.client.flushall();
    }
}

export default SlidingWindowCounter;
