import * as ioredis from 'ioredis';
import { RedisWindow } from '../../src/@types/rateLimit';
// import SlidingWindowCounter from '../../src/rateLimiters/slidingWindowCounter';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RedisMock = require('ioredis-mock');

const CAPACITY = 10; // allowed tokens per fixed window
const WINDOW_SIZE = 60000; // size of window in ms (this is 1 minute)

// let limiter: SlidingWindowCounter;
let client: ioredis.Redis;
let timestamp: number;
const user1 = '1';
const user2 = '2';
const user3 = '3';
const user4 = '4';

async function getBucketFromClient(redisClient: ioredis.Redis, uuid: string): Promise<RedisWindow> {
    const res = await redisClient.get(uuid);
    // if no uuid is found, return -1 for all values, which is impossible
    if (res === null) return { tokens: -1, timestamp: -1, fixedWindowStart: -1 };
    return JSON.parse(res);
}

async function setTokenCountInClient(
    redisClient: ioredis.Redis,
    uuid: string,
    tokens: number,
    time: number
) {
    // fixed window start will always be to the exact minute
    const fixedWindowStart = time - (time % 60000);
    const value: RedisWindow = { tokens, timestamp: time, fixedWindowStart };
    await redisClient.set(uuid, JSON.stringify(value));
}

describe('Test TokenBucket Rate Limiter', () => {
    beforeEach(async () => {
        // Initialize a new sliding window counter before each test
        // create a mock user
        // intialze the sliding window counter algorithm
        client = new RedisMock();
        // limiter = new SlidingWindowCounter(WINDOW_SIZE, CAPACITY, client);
        timestamp = new Date().valueOf();
    });

    describe('SlidingWindowCounter returns correct number of tokens and updates redis store as expected', () => {
        describe('after an ALLOWED request...', () => {
            afterEach(() => {
                client.flushall();
            });
            test('bucket is initially full', async () => {
                // Bucket intially full
                const withdraw5 = 5;
                expect((await limiter.processRequest(user1, timestamp, withdraw5)).tokens).toBe(
                    CAPACITY - withdraw5
                );
                const tokenCountFull = await getBucketFromClient(client, user1);
                expect(tokenCountFull.tokens).toBe(CAPACITY - withdraw5);
            });

            test('bucket is partially full and request has leftover tokens', async () => {
                // Bucket partially full but enough time has elapsed to fill the bucket since the last request and
                // has leftover tokens after reqeust
                const initial = 6;
                const partialWithdraw = 1;
                await setTokenCountInClient(client, user2, initial, timestamp);
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
                expect(tokenCountPartial.tokens).toBe(CAPACITY - (initial + partialWithdraw));
            });

            // Bucket partially full and no leftover tokens after reqeust
            test('bucket is partially full and request has no leftover tokens', async () => {
                const initial = 6;
                await setTokenCountInClient(client, user2, initial, timestamp);
                expect((await limiter.processRequest(user2, timestamp, initial)).tokens).toBe(0);
                const tokenCountPartialToEmpty = await getBucketFromClient(client, user2);
                expect(tokenCountPartialToEmpty.tokens).toBe(0);
            });

            // Bucket initially empty but enough time elapsed to paritally fill bucket since last request
            test('bucket is initially empty but enough time has elapsed to partially fill the bucket', async () => {
                await setTokenCountInClient(client, user4, 0, timestamp);
                expect((await limiter.processRequest(user4, timestamp + 6000, 4)).tokens).toBe(2);
                const count = await getBucketFromClient(client, user4);
                expect(count.tokens).toBe(2);
            });
        });
    });
});
