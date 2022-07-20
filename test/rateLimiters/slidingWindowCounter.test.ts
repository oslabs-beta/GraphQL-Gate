import * as ioredis from 'ioredis';
import { RedisWindow } from '../../src/@types/rateLimit';
import SlidingWindowCounter from '../../src/rateLimiters/slidingWindowCounter';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RedisMock = require('ioredis-mock');

const CAPACITY = 10; // allowed tokens per fixed window
const WINDOW_SIZE = 60000; // size of window in ms (this is 1 minute)

let limiter: SlidingWindowCounter;
let client: ioredis.Redis;
let timestamp: number;
const user1 = '1';
const user2 = '2';
const user3 = '3';
const user4 = '4';

async function getWindowFromClient(redisClient: ioredis.Redis, uuid: string): Promise<RedisWindow> {
    const res = await redisClient.get(uuid);
    // if no uuid is found, return -1 for all values, which is impossible
    if (res === null) return { currentTokens: -1, previousTokens: -1, fixedWindowStart: -1 };
    return JSON.parse(res);
}

// helper function to set mock redis cache
async function setTokenCountInClient(
    redisClient: ioredis.Redis,
    uuid: string,
    currentTokens: number,
    previousTokens: number,
    fixedWindowStart: number
) {
    const value: RedisWindow = { currentTokens, previousTokens, fixedWindowStart };
    await redisClient.set(uuid, JSON.stringify(value));
}

describe('Test TokenBucket Rate Limiter', () => {
    beforeEach(async () => {
        // init a mock redis cache
        client = new RedisMock();
        // init a new sliding window counter instance
        limiter = new SlidingWindowCounter(WINDOW_SIZE, CAPACITY, client);
        // get the current time
        timestamp = new Date().valueOf();
    });

    describe('SlidingWindowCounter returns correct number of tokens and updates redis store as expected', () => {
        describe('after an ALLOWED request...', () => {
            afterEach(() => {
                client.flushall();
            });
            test('fixed window and cache are initially empty', async () => {
                // window is intially empty
                const withdraw5 = 5;
                expect((await limiter.processRequest(user1, timestamp, withdraw5)).tokens).toBe(
                    CAPACITY - withdraw5
                );
                const tokenCountFull = await getWindowFromClient(client, user1);
                expect(tokenCountFull.currentTokens).toBe(CAPACITY - withdraw5);
                expect(tokenCountFull.previousTokens).toBe(0);
            });

            test('fixed window is initially empty', async () => {
                // window is intially empty
                const withdraw5 = 5;
                expect((await limiter.processRequest(user1, timestamp, withdraw5)).tokens).toBe(
                    CAPACITY - withdraw5
                );
                const tokenCountFull = await getWindowFromClient(client, user1);
                expect(tokenCountFull.currentTokens).toBe(CAPACITY - withdraw5);
                expect(tokenCountFull.previousTokens).toBe(0);
            });

            test('fixed window is partially full and request has leftover tokens', async () => {
                // Window is partially full but still has space for another small request
                const initial = 6;
                const partialWithdraw = 3;
                expect((await limiter.processRequest(user2, timestamp, initial)).tokens).toBe(
                    CAPACITY - initial
                );
                expect(
                    (await limiter.processRequest(user2, timestamp, partialWithdraw)).tokens
                ).toBe(CAPACITY - (initial + partialWithdraw));

                const tokenCountPartial = await getWindowFromClient(client, user2);
                expect(tokenCountPartial.currentTokens).toBe(initial + partialWithdraw);
            });

            // window partially full and no leftover tokens after request
            test('fixed window is partially full and request has no leftover tokens', async () => {
                const initial = 6;
                await setTokenCountInClient(client, user2, initial, 0, timestamp);
                expect(
                    (await limiter.processRequest(user2, timestamp, CAPACITY - initial)).tokens
                ).toBe(0);
                const tokenCountPartialToEmpty = await getWindowFromClient(client, user2);
                expect(tokenCountPartialToEmpty.currentTokens).toBe(10);
            });

            // Window initially full but enough time elapsed to paritally fill window since last request
            test('fixed window is initially full but after new fixed window is initialized request is allowed', async () => {
                await setTokenCountInClient(client, user4, 10, 0, timestamp);
                // tokens returned in processRequest is equal to the capacity
                // still available in the fixed window

                // adds additional ms so that:
                // rolling window proportion: .99999...
                // 1 + 10 * .9 = 10 (floored)
                const result = await limiter.processRequest(user4, timestamp + WINDOW_SIZE + 1, 1);

                // should be allowed because formula is floored
                expect(result.success).toBe(true);
                expect(result.tokens).toBe(0);

                // here, we expect the rolling window to only allow 1 token, b/c
                // only 1ms has passed since the previous fixed window

                // `currentTokens` cached is the amount of tokens
                // currently in the fixed window.
                // this differs from token bucket, which caches the amount
                // of tokens still available for use
                const count = await getWindowFromClient(client, user4);
                expect(count.currentTokens).toBe(1);
            });

            // five different tests within, with different rolling window proportions (0.01, .25, .5, .75, 1)
            test('rolling window at 100% allows requests under capacity', async () => {
                // 100% of rolling window present in previous fixed window
                // 1*60000 = 60000 (time after initial fixedWindowStart
                // to set rolling window at 100% of previous fixed window)

                // to set initial fixedWindowStart
                await setTokenCountInClient(client, user4, 0, 0, timestamp);

                // large request at very end of first fixed window
                await limiter.processRequest(user4, timestamp + WINDOW_SIZE - 1, 8);

                // 2 + 8 * 1 = 10, right at capacity (request should be allowed)
                // tokens until capacity: 0 (tokens property returned by processRequest method)
                const result = await limiter.processRequest(user4, timestamp + WINDOW_SIZE, 2);
                expect(result.tokens).toBe(0);
                expect(result.success).toBe(true);

                // currentTokens (in current fixed window): 4
                // previousTokens (in previous fixed window): 8
                const count1 = await getWindowFromClient(client, user4);
                expect(count1.currentTokens).toBe(2);
                expect(count1.previousTokens).toBe(8);
            });

            test('rolling window at 75% allows requests under capacity', async () => {
                // 75% of rolling window present in previous fixed window
                // 1.25*60000 = 75000 (time after initial fixedWindowStart
                // to set rolling window at 75% of previous fixed window)

                // to set initial fixedWindowStart
                await setTokenCountInClient(client, user4, 0, 0, timestamp);

                // large request at very end of first fixed window
                await limiter.processRequest(user4, timestamp + WINDOW_SIZE - 1, 8);

                // 4 + 8 * .75 = 10, right at capacity (request should be allowed)
                // tokens until capacity: 0 (tokens property returned by processRequest method)
                const result = await limiter.processRequest(
                    user4,
                    timestamp + WINDOW_SIZE * 1.25,
                    4
                );
                expect(result.tokens).toBe(0);
                expect(result.success).toBe(true);

                // currentTokens (in current fixed window): 4
                // previousTokens (in previous fixed window): 8
                const count1 = await getWindowFromClient(client, user4);
                expect(count1.currentTokens).toBe(4);
                expect(count1.previousTokens).toBe(8);
            });

            test('rolling window at 50% allows requests under capacity', async () => {
                // 50% of rolling window present in previous fixed window
                // 1.5*60000 = 90000 (time after initial fixedWindowStart
                // to set rolling window at 50% of previous fixed window)

                // to set initial fixedWindowStart
                await setTokenCountInClient(client, user4, 0, 0, timestamp);

                // large request at very end of first fixed window
                await limiter.processRequest(user4, timestamp + WINDOW_SIZE - 1, 8);

                // 4 + 8 * .5 = 8, under capacity (request should be allowed)
                // tokens until capacity: 2 (tokens property returned by processRequest method)
                const result = await limiter.processRequest(
                    user4,
                    timestamp + WINDOW_SIZE * 1.5,
                    4
                );
                expect(result.tokens).toBe(2);
                expect(result.success).toBe(true);

                // currentTokens (in current fixed window): 4
                // previousTokens (in previous fixed window): 8
                const count = await getWindowFromClient(client, user4);
                expect(count.currentTokens).toBe(4);
                expect(count.previousTokens).toBe(8);
            });

            test('rolling window at 25% allows requests under capacity', async () => {
                // 25% of rolling window present in previous fixed window
                // 1.75*60000 = 105000 (time after initial fixedWindowStart
                // to set rolling window at 25% of previous fixed window)

                // to set initial fixedWindowStart
                await setTokenCountInClient(client, user4, 0, 0, timestamp);

                // large request at very end of first fixed window
                await limiter.processRequest(user4, timestamp + WINDOW_SIZE - 1, 8);

                // 4 + 8 * .25 = 6, under capacity (request should be allowed)
                // tokens until capacity: 4 (tokens property returned by processRequest method)
                const result = await limiter.processRequest(
                    user4,
                    timestamp + WINDOW_SIZE * 1.75,
                    4
                );
                expect(result.tokens).toBe(4);
                expect(result.success).toBe(true);

                // currentTokens (in current fixed window): 4
                // previousTokens (in previous fixed window): 8
                const count = await getWindowFromClient(client, user4);
                expect(count.currentTokens).toBe(4);
                expect(count.previousTokens).toBe(8);
            });

            test('rolling window at 1% allows requests under capacity', async () => {
                // 1% of rolling window present in previous fixed window
                // 0.01*60000 = 600 (time after initial fixedWindowStart
                // to set rolling window at 1% of previous fixed window)

                // to set initial fixedWindowStart
                await setTokenCountInClient(client, user4, 0, 0, timestamp);

                // large request at very end of first fixed window
                await limiter.processRequest(user4, timestamp + WINDOW_SIZE - 1, 8);

                // 10 + 8 * .01 = 10, right at capacity (request should be allowed)
                // tokens until capacity: 0 (tokens property returned by processRequest method)
                const result = await limiter.processRequest(
                    user4,
                    timestamp + WINDOW_SIZE * 1.99,
                    4
                );
                expect(result.tokens).toBe(0);
                expect(result.success).toBe(true);

                // currentTokens (in current fixed window): 4
                // previousTokens (in previous fixed window): 8
                const count1 = await getWindowFromClient(client, user4);
                expect(count1.currentTokens).toBe(4);
                expect(count1.previousTokens).toBe(8);
            });
        });

        describe('after a BLOCKED request...', () => {
            afterEach(() => {
                client.flushall();
            });

            test('initial request is greater than capacity', async () => {
                // expect remaining tokens to be 10, b/c the 11 token request should be blocked
                expect((await limiter.processRequest(user1, timestamp, 11)).tokens).toBe(10);
                // expect current tokens in the window to still be 0
                expect((await getWindowFromClient(client, user1)).currentTokens).toBe(0);
            });

            test('window is partially full but not enough time elapsed to reach new window', async () => {
                const initRequest = 6;

                await setTokenCountInClient(client, user2, initRequest, 0, timestamp);
                // expect remaining tokens to be 4, b/c the 5 token request should be blocked
                const result = await limiter.processRequest(user2, timestamp + WINDOW_SIZE - 1, 5);

                expect(result.success).toBe(false);
                expect(result.tokens).toBe(CAPACITY - initRequest);

                // expect current tokens in the window to still be 6
                expect((await getWindowFromClient(client, user2)).currentTokens).toBe(6);
            });

            // 5 rolling window tests with different proportions (.01, .25, .5, .75, 1)
            test('rolling window at 100% blocks requests over allowed limit set by formula', async () => {
                // 100% of rolling window present in previous fixed window
                // 1*60000 = 60000 (time after initial fixedWindowStart
                // to set rolling window at 100% of previous fixed window)

                // to set initial fixedWindowStart
                await setTokenCountInClient(client, user4, 0, 0, timestamp);

                const initRequest = 8;

                // large request at very end of first fixed window
                await limiter.processRequest(user4, timestamp + WINDOW_SIZE - 1, initRequest);

                // 3 + 8 * 1 = 11, above capacity (request should be blocked)
                const result = await limiter.processRequest(user4, timestamp + WINDOW_SIZE, 3);
                expect(result.tokens).toBe(10);
                expect(result.success).toBe(false);

                // currentTokens (in current fixed window): 0
                // previousTokens (in previous fixed window): 8
                const count1 = await getWindowFromClient(client, user4);
                expect(count1.currentTokens).toBe(0);
                expect(count1.previousTokens).toBe(initRequest);
            });
            test('rolling window at 75% blocks requests over allowed limit set by formula', async () => {
                // 75% of rolling window present in previous fixed window
                // 1.25*60000 = 75000 (time after initial fixedWindowStart
                // to set rolling window at 75% of previous fixed window)

                // to set initial fixedWindowStart
                await setTokenCountInClient(client, user4, 0, 0, timestamp);

                const initRequest = 8;

                // large request at very end of first fixed window
                await limiter.processRequest(user4, timestamp + WINDOW_SIZE - 1, initRequest);

                // 5 + 8 * .75 = 11, above capacity (request should be blocked)
                const result = await limiter.processRequest(
                    user4,
                    timestamp + WINDOW_SIZE * 1.25,
                    5
                );
                expect(result.tokens).toBe(10);
                expect(result.success).toBe(false);

                // currentTokens (in current fixed window): 0
                // previousTokens (in previous fixed window): 8
                const count1 = await getWindowFromClient(client, user4);
                expect(count1.currentTokens).toBe(0);
                expect(count1.previousTokens).toBe(initRequest);
            });
        });

        test('rolling window at 50% blocks requests over allowed limit set by formula', async () => {
            // 50% of rolling window present in previous fixed window
            // 1.5*60000 = 90000 (time after initial fixedWindowStart
            // to set rolling window at 50% of previous fixed window)

            // to set initial fixedWindowStart
            await setTokenCountInClient(client, user4, 0, 0, timestamp);

            const initRequest = 8;

            // large request at very end of first fixed window
            await limiter.processRequest(user4, timestamp + WINDOW_SIZE - 1, initRequest);

            // 7 + 8 * .5 = 11, over capacity (request should be blocked)
            const result = await limiter.processRequest(user4, timestamp + WINDOW_SIZE * 1.5, 7);
            expect(result.tokens).toBe(10);
            expect(result.success).toBe(false);

            // currentTokens (in current fixed window): 0
            // previousTokens (in previous fixed window): 8
            const count = await getWindowFromClient(client, user4);
            expect(count.currentTokens).toBe(0);
            expect(count.previousTokens).toBe(initRequest);
        });

        test('rolling window at 25% blocks requests over allowed limit set by formula', async () => {
            // 25% of rolling window present in previous fixed window
            // 1.75*60000 = 105000 (time after initial fixedWindowStart
            // to set rolling window at 25% of previous fixed window)

            // to set initial fixedWindowStart
            await setTokenCountInClient(client, user4, 0, 0, timestamp);

            const initRequest = 8;

            // large request at very end of first fixed window
            await limiter.processRequest(user4, timestamp + WINDOW_SIZE - 1, initRequest);

            // 9 + 8 * .25 = 11, over capacity (request should be blocked)
            const result = await limiter.processRequest(user4, timestamp + WINDOW_SIZE * 1.75, 9);
            expect(result.tokens).toBe(10);
            expect(result.success).toBe(false);

            // currentTokens (in current fixed window): 0
            // previousTokens (in previous fixed window): 8
            const count = await getWindowFromClient(client, user4);
            expect(count.currentTokens).toBe(0);
            expect(count.previousTokens).toBe(initRequest);
        });
        test('rolling window at 100% blocks requests over allowed limit set by formula', async () => {
            // 1% of rolling window present in previous fixed window
            // .01*60000 = 600 (time after initial fixedWindowStart
            // to set rolling window at 100% of previous fixed window)

            // to set initial fixedWindowStart
            await setTokenCountInClient(client, user4, 0, 0, timestamp);

            const initRequest = 8;

            // large request at very end of first fixed window
            await limiter.processRequest(user4, timestamp + WINDOW_SIZE - 1, initRequest);

            // 11 + 8 * .01 = 11, above capacity (request should be blocked)
            const result = await limiter.processRequest(user4, timestamp + WINDOW_SIZE, 11);
            expect(result.tokens).toBe(10);
            expect(result.success).toBe(false);

            // currentTokens (in current fixed window): 0
            // previousTokens (in previous fixed window): 8
            const count1 = await getWindowFromClient(client, user4);
            expect(count1.currentTokens).toBe(0);
            expect(count1.previousTokens).toBe(initRequest);
        });
    });

    describe('SlidingWindowCounter functions as expected', () => {
        afterEach(() => {
            client.flushall();
        });

        test('allows user to consume current allotment of tokens', async () => {
            // "free requests"
            expect((await limiter.processRequest(user1, timestamp, 0)).success).toBe(true);
            // Test 1 token requested
            expect((await limiter.processRequest(user1, timestamp, 1)).success).toBe(true);
            // Test < CAPACITY tokens requested
            expect((await limiter.processRequest(user2, timestamp, CAPACITY - 1)).success).toBe(
                true
            );
            // <= CAPACITY tokens requested
            expect((await limiter.processRequest(user3, timestamp, CAPACITY)).success).toBe(true);
        });

        test('blocks exceeding requests over token allotment', async () => {
            // Test > capacity tokens requested
            expect((await limiter.processRequest(user1, timestamp, CAPACITY + 1)).success).toBe(
                false
            );

            // Fill up user 1's window
            const value: RedisWindow = {
                currentTokens: 10,
                previousTokens: 0,
                fixedWindowStart: timestamp,
            };
            await client.set(user1, JSON.stringify(value));

            // window is full. Shouldn't be allowed to take 1 token
            expect((await limiter.processRequest(user1, timestamp, 1)).success).toBe(false);

            // Should still be allowed to process "free" requests
            expect((await limiter.processRequest(user1, timestamp, 0)).success).toBe(true);
        });

        test('fixed window and current/previous tokens update as expected', async () => {
            // fills first window with 5 tokens
            await limiter.processRequest(user1, timestamp, 5);
            // fills second window with 4 tokens
            expect(
                await (
                    await limiter.processRequest(user1, timestamp + WINDOW_SIZE, 4)
                ).tokens
            ).toBe(2);
            // currentTokens (in current fixed window): 0
            // previousTokens (in previous fixed window): 8
            const count = await getWindowFromClient(client, user1);
            // ensures that fixed window is updated when a request goes over
            expect(count.fixedWindowStart).toBe(timestamp + WINDOW_SIZE);
            // ensures that previous tokens property updates on fixed window change
            expect(count.previousTokens).toBe(5);
            // ensures that current tokens only represents tokens from current window requests
            expect(count.currentTokens).toBe(4);
        });

        test('sliding window allows custom window sizes', async () => {
            const newWindowSize = 10000;

            const newLimiter = new SlidingWindowCounter(newWindowSize, CAPACITY, client);

            await newLimiter.processRequest(user1, timestamp, 8);

            // expect that a new window is entered, leaving 2 tokens available after both requests
            // 8 * .99 -> 7 (floored) + 1 = 8
            expect(
                (await newLimiter.processRequest(user1, timestamp + newWindowSize + 1, 1)).tokens
            ).toBe(2);
        });

        test('sliding window allows custom capacities', async () => {
            const newCapacity = 5;

            const newLimiter = new SlidingWindowCounter(WINDOW_SIZE, newCapacity, client);

            // expect that tokens available after request will be consistent with the new capacity
            expect((await newLimiter.processRequest(user1, timestamp, newCapacity)).tokens).toBe(0);
        });

        test('users have their own windows', async () => {
            const requested = 6;
            const user3Tokens = 8;
            // Add tokens for user 3 so we have both a user that exists in the store (3) and one that doesn't (2)
            await setTokenCountInClient(client, user3, user3Tokens, 0, timestamp);

            // issue a request for user 1;
            await limiter.processRequest(user1, timestamp, requested);

            // Check that each user has the expected amount of tokens.
            expect((await getWindowFromClient(client, user1)).currentTokens).toBe(requested);
            // not in the store so this returns -1
            expect((await getWindowFromClient(client, user2)).currentTokens).toBe(-1);
            expect((await getWindowFromClient(client, user3)).currentTokens).toBe(user3Tokens);

            await limiter.processRequest(user2, timestamp, 1);
            expect((await getWindowFromClient(client, user1)).currentTokens).toBe(requested);
            expect((await getWindowFromClient(client, user2)).currentTokens).toBe(1);
            expect((await getWindowFromClient(client, user3)).currentTokens).toBe(user3Tokens);
        });

        test("sliding window doesn't allow capacity/window size <= 0", () => {
            expect(() => new SlidingWindowCounter(0, 10, client)).toThrow(
                'SlidingWindowCounter windowSize and capacity must be positive'
            );
            expect(() => new SlidingWindowCounter(-1, 10, client)).toThrow(
                'SlidingWindowCounter windowSize and capacity must be positive'
            );
            expect(() => new SlidingWindowCounter(10, -1, client)).toThrow(
                'SlidingWindowCounter windowSize and capacity must be positive'
            );
            expect(() => new SlidingWindowCounter(10, 0, client)).toThrow(
                'SlidingWindowCounter windowSize and capacity must be positive'
            );
        });

        test('all windows should be able to be reset', async () => {
            const tokens = 5;
            await setTokenCountInClient(client, user1, tokens, 0, timestamp);
            await setTokenCountInClient(client, user2, tokens, 0, timestamp);
            await setTokenCountInClient(client, user3, tokens, 0, timestamp);

            limiter.reset();

            expect((await limiter.processRequest(user1, timestamp, CAPACITY)).success).toBe(true);
            expect((await limiter.processRequest(user2, timestamp, CAPACITY - 1)).success).toBe(
                true
            );
            expect((await limiter.processRequest(user3, timestamp, CAPACITY + 1)).success).toBe(
                false
            );
        });

        test('updates correctly when > WINDOW_SIZE * 2 has surpassed', async () => {
            await setTokenCountInClient(client, user1, 1, 0, timestamp);

            // to make sure that previous tokens is not 1
            const result = await limiter.processRequest(user1, timestamp + WINDOW_SIZE * 2, 1);

            expect(result.tokens).toBe(9);

            const redisData: RedisWindow = await getWindowFromClient(client, user1);

            expect(redisData.currentTokens).toBe(1);
            expect(redisData.previousTokens).toBe(0);
            expect(redisData.fixedWindowStart).toBe(timestamp + WINDOW_SIZE * 2);
        });
    });

    describe('SlidingWindowCounter correctly updates Redis cache', () => {
        afterEach(() => {
            client.flushall();
        });

        test('timestamp correctly updated in redis', async () => {
            let redisData: RedisWindow;

            // blocked request
            await limiter.processRequest(user1, timestamp, CAPACITY + 1);
            redisData = await getWindowFromClient(client, user1);
            expect(redisData.fixedWindowStart).toBe(timestamp);

            timestamp += 1000;
            // allowed request
            await limiter.processRequest(user2, timestamp, CAPACITY);
            redisData = await getWindowFromClient(client, user2);
            expect(redisData.fixedWindowStart).toBe(timestamp);
        });

        test('current/previous tokens correctly updated in redis', async () => {
            let redisData: RedisWindow;

            await limiter.processRequest(user1, timestamp, 2);

            redisData = await getWindowFromClient(client, user1);

            expect(redisData.currentTokens).toBe(2);

            // new window
            await limiter.processRequest(user1, timestamp + WINDOW_SIZE, 3);

            redisData = await getWindowFromClient(client, user1);

            expect(redisData.currentTokens).toBe(3);
            expect(redisData.previousTokens).toBe(2);
            expect(redisData.fixedWindowStart).toBe(timestamp + WINDOW_SIZE);
        });

        test('all windows should be able to be reset', async () => {
            // add data to redis
            const time = new Date();
            const value = JSON.stringify({ tokens: 0, timestamp: time.valueOf() });

            await client.set(user1, value);
            await client.set(user2, value);
            await client.set(user3, value);

            limiter.reset();

            const resetUser1 = await client.get(user1);
            const resetUser2 = await client.get(user2);
            const resetUser3 = await client.get(user3);
            expect(resetUser1).toBe(null);
            expect(resetUser2).toBe(null);
            expect(resetUser3).toBe(null);
        });
    });
});
