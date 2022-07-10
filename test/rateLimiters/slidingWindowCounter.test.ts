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

async function getBucketFromClient(redisClient: ioredis.Redis, uuid: string): Promise<RedisWindow> {
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

    // AFTER AN ALLOWED REQUEST
    // sliding window can take two requests within capacity
    // sliding window can take more than capacity when new minute elapses
    // sliding window is initially full, but after a minute passes allows more requests
    // sliding window allows requests under allowed limit set by formula
    // 3 rolling window tests with different proportions (.25, .5, .75)

    // AFTER A BLOCKED REQUEST
    // initial request is greater than capacity
    // window is partially full but not enough time elapsed to reach new window
    // window blocks requests over allowed limit set by formula
    // 3 rolling window tests with different proportions (.25, .5, .75)

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
                const tokenCountFull = await getBucketFromClient(client, user1);
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
                const tokenCountPartial = await getBucketFromClient(client, user2);
                expect(tokenCountPartial.currentTokens).toBe(
                    CAPACITY - (initial + partialWithdraw)
                );
            });

            // Bucket partially full and no leftover tokens after reqeust
            xtest('bucket is partially full and request has no leftover tokens', async () => {
                const initial = 6;
                // await setTokenCountInClient(client, user2, initial, timestamp);
                expect((await limiter.processRequest(user2, timestamp, initial)).tokens).toBe(0);
                const tokenCountPartialToEmpty = await getBucketFromClient(client, user2);
                expect(tokenCountPartialToEmpty.currentTokens).toBe(0);
            });

            // Bucket initially empty but enough time elapsed to paritally fill bucket since last request
            xtest('bucket is initially empty but enough time has elapsed to partially fill the bucket', async () => {
                // await setTokenCountInClient(client, user4, 0, timestamp);
                expect((await limiter.processRequest(user4, timestamp + 6000, 4)).tokens).toBe(2);
                const count = await getBucketFromClient(client, user4);
                expect(count.currentTokens).toBe(2);
            });
        });

        describe('after a BLOCKED request...', () => {
            afterEach(() => {
                client.flushall();
            });
        });
    });

    // allows user to consume current allotment of tokens
    // blocks exceeding requests over token allotment
    // sliding window never exceeds maximum capacity
    // rolling window formula operates as expected
    // fixed window and current/previous tokens update as expected
    // sliding window allows custom window sizes
    // sliding window allows custom capacities
    // users have their own windows
    // sliding window doesn't allow capacity/window size < 1
    // all windows should be able to be reset

    describe('SlidingWindowCounter functions as expected', () => {});

    // timestamp correctly updated in redis
    // current/previous tokens correctly updated in redis
    // all windows should be able to be reset

    describe('SlidingWindowCounter correctly updates Redis cache', () => {});
});
