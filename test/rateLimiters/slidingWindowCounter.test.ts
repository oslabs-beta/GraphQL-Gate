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
                const partialWithdraw = 1;
                // await setTokenCountInClient(client, user2, initial, timestamp);
                expect(
                    (
                        await limiter.processRequest(
                            user2,
                            timestamp + 1000 * (CAPACITY - initial),
                            initial + partialWithdraw
                        )
                    ).tokens
                ).toBe(CAPACITY - (initial + partialWithdraw));
                const tokenCountPartial = await getWindowFromClient(client, user2);
                expect(tokenCountPartial.currentTokens).toBe(
                    CAPACITY - (initial + partialWithdraw)
                );
            });

            // window partially full and no leftover tokens after request
            xtest('fixed window is partially full and request has no leftover tokens', async () => {
                const initial = 6;
                // await setTokenCountInClient(client, user2, initial, timestamp);
                expect((await limiter.processRequest(user2, timestamp, initial)).tokens).toBe(0);
                const tokenCountPartialToEmpty = await getWindowFromClient(client, user2);
                expect(tokenCountPartialToEmpty.currentTokens).toBe(0);
            });

            xtest('fixed window can process two requests within capacity', async () => {
                const initial = 6;
                // await setTokenCountInClient(client, user2, initial, timestamp);
                expect((await limiter.processRequest(user2, timestamp, initial)).tokens).toBe(0);
                const tokenCountPartialToEmpty = await getWindowFromClient(client, user2);
                expect(tokenCountPartialToEmpty.currentTokens).toBe(0);
            });

            // Bucket initially empty but enough time elapsed to paritally fill bucket since last request
            xtest('fixed window is initially full but after new fixed window is initialized request is allowed', async () => {
                // await setTokenCountInClient(client, user4, 0, timestamp);
                expect((await limiter.processRequest(user4, timestamp + 6000, 4)).tokens).toBe(2);
                const count = await getWindowFromClient(client, user4);
                expect(count.currentTokens).toBe(2);
            });

            xtest('sliding window allows requests under allowed limit set by formula', async () => {
                // three different tests within, with different rolling window proportions (.25, .5, .75)
                expect((await limiter.processRequest(user4, timestamp + 6000, 4)).tokens).toBe(2);
                const count = await getWindowFromClient(client, user4);
                expect(count.currentTokens).toBe(2);
            });
        });

        describe('after a BLOCKED request...', () => {
            afterEach(() => {
                client.flushall();
            });

            xtest('initial request is greater than capacity', () => {});

            xtest('window is partially full but not enough time elapsed to reach new window', () => {});

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
