import * as ioredis from 'ioredis';
import { RedisBucket, RedisWindow } from '../../src/@types/rateLimit';
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
    previousTokens: number | null,
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
            test('fixed window is initially empty', async () => {
                // window is intially empty
                const withdraw5 = 5;
                expect((await limiter.processRequest(user1, timestamp, withdraw5)).tokens).toBe(
                    CAPACITY - withdraw5
                );
                const tokenCountFull = await getWindowFromClient(client, user1);
                expect(tokenCountFull.currentTokens).toBe(CAPACITY - withdraw5);
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
                expect(tokenCountPartial.currentTokens).toBe(
                    CAPACITY - (initial + partialWithdraw)
                );
            });

            // window partially full and no leftover tokens after request
            test('fixed window is partially full and request has no leftover tokens', async () => {
                const initial = 6;
                await setTokenCountInClient(client, user2, initial, null, timestamp);
                expect((await limiter.processRequest(user2, timestamp, initial)).tokens).toBe(0);
                const tokenCountPartialToEmpty = await getWindowFromClient(client, user2);
                expect(tokenCountPartialToEmpty.currentTokens).toBe(0);
            });

            // Bucket initially empty but enough time elapsed to paritally fill bucket since last request
            xtest('fixed window is initially full but after new fixed window is initialized request is allowed', async () => {
                await setTokenCountInClient(client, user4, 10, null, timestamp);
                // tokens returned in processRequest is equal to the capacity
                // still available in the fixed window
                expect(
                    (await limiter.processRequest(user4, timestamp + WINDOW_SIZE, 10)).tokens
                ).toBe(0);
                // `currentTokens` cached is the amount of tokens
                // currently in the fixed window.
                // this differs from token bucket, which caches the amount
                // of tokens still available for use
                const count = await getWindowFromClient(client, user4);
                expect(count.currentTokens).toBe(10);
            });

            // three different tests within, with different rolling window proportions (.25, .5, .75)
            xtest('rolling window at 75% allows requests under capacity', async () => {
                // 75% of rolling window present in previous fixed window
                // 1.25*60000 = 75000 (time after initial fixedWindowStart
                // to set rolling window at 75% of previous fixed window)

                // to set initial fixedWindowStart
                await setTokenCountInClient(client, user4, 0, null, timestamp);

                // large request at very end of first fixed window
                await limiter.processRequest(user4, timestamp + 59999, 8);

                // 4 + 8 * .75 = 10, right at capacity (request should be allowed)
                // tokens until capacity: 0 (tokens property returned by processRequest method)
                expect((await limiter.processRequest(user4, timestamp + 75000, 4)).tokens).toBe(0);

                // currentTokens (in current fixed window): 4
                // previousTokens (in previous fixed window): 8
                const count1 = await getWindowFromClient(client, user4);
                expect(count1.currentTokens).toBe(4);
                expect(count1.previousTokens).toBe(8);
            });

            xtest('rolling window at 50% allows requests under capacity', async () => {
                // 50% of rolling window present in previous fixed window
                // 1.5*60000 = 90000 (time after initial fixedWindowStart
                // to set rolling window at 50% of previous fixed window)

                // to set initial fixedWindowStart
                await setTokenCountInClient(client, user4, 0, null, timestamp);

                // large request at very end of first fixed window
                await limiter.processRequest(user4, timestamp + 59999, 8);

                // 4 + 8 * .5 = 8, under capacity (request should be allowed)
                // tokens until capacity: 2 (tokens property returned by processRequest method)
                expect((await limiter.processRequest(user4, timestamp + 90000, 4)).tokens).toBe(2);

                // currentTokens (in current fixed window): 4
                // previousTokens (in previous fixed window): 8
                const count = await getWindowFromClient(client, user4);
                expect(count.currentTokens).toBe(4);
                expect(count.previousTokens).toBe(8);
            });

            xtest('rolling window at 25% allows requests under capacity', async () => {
                // 25% of rolling window present in previous fixed window
                // 1.75*60000 = 105000 (time after initial fixedWindowStart
                // to set rolling window at 25% of previous fixed window)

                // to set initial fixedWindowStart
                await setTokenCountInClient(client, user4, 0, null, timestamp);

                // large request at very end of first fixed window
                await limiter.processRequest(user4, timestamp + 59999, 8);

                // 4 + 8 * .25 = 6, under capacity (request should be allowed)
                // tokens until capacity: 4 (tokens property returned by processRequest method)
                expect((await limiter.processRequest(user4, timestamp + 105000, 4)).tokens).toBe(4);

                // currentTokens (in current fixed window): 4
                // previousTokens (in previous fixed window): 8
                const count = await getWindowFromClient(client, user4);
                expect(count.currentTokens).toBe(4);
                expect(count.previousTokens).toBe(8);
            });
        });

        describe('after a BLOCKED request...', () => {
            afterEach(() => {
                client.flushall();
            });

            xtest('initial request is greater than capacity', async () => {
                await setTokenCountInClient(client, user2, 0, null, timestamp);
                // expect remaining tokens to be 10, b/c the 11 token request should be blocked
                expect((await limiter.processRequest(user2, timestamp, 11)).tokens).toBe(10);

                const tokenCountPartialToEmpty = await getWindowFromClient(client, user2);
                // expect current tokens in the window to still be 0
                expect(tokenCountPartialToEmpty.currentTokens).toBe(0);
            });

            xtest('window is partially full but not enough time elapsed to reach new window', async () => {
                await setTokenCountInClient(client, user2, 6, null, timestamp);
                // expect remaining tokens to be 10, b/c the 5 token request should be blocked
                expect(
                    (await limiter.processRequest(user2, timestamp + WINDOW_SIZE - 1, 5)).tokens
                ).toBe(10);

                const tokenCountPartialToEmpty = await getWindowFromClient(client, user2);
                // expect current tokens in the window to still be 0
                expect(tokenCountPartialToEmpty.currentTokens).toBe(0);
            });

            xtest('window blocks requests over allowed limit set by formula', () => {
                // 3 rolling window tests with different proportions (.25, .5, .75)
            });
        });
    });

    describe('SlidingWindowCounter functions as expected', () => {
        afterEach(() => {
            client.flushall();
        });

        xtest('allows user to consume current allotment of tokens', () => {});

        xtest('blocks exceeding requests over token allotment', () => {});

        xtest('sliding window never exceeds maximum capacity', () => {});

        xtest('rolling window formula operates as expected', () => {});

        xtest('fixed window and current/previous tokens update as expected', () => {});

        xtest('sliding window allows custom window sizes', () => {});

        xtest('sliding window allows custom capacities', () => {});

        xtest('users have their own windows', () => {});

        xtest("sliding window doesn't allow capacity/window size < 1", () => {});

        xtest('all windows should be able to be reset', () => {});
    });

    describe('SlidingWindowCounter correctly updates Redis cache', () => {
        afterEach(() => {
            client.flushall();
        });

        xtest('timestamp correctly updated in redis', () => {});

        xtest('current/previous tokens correctly updated in redis', () => {});

        xtest('all windows should be able to be reset', () => {});
    });
});
