import * as ioredis from 'ioredis';
import { RedisBucket } from '../../src/@types/rateLimit';
import TokenBucket from '../../src/rateLimiters/tokenBucket';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RedisMock = require('ioredis-mock');

const CAPACITY = 10;
// FIXME: Changing the refill rate effects test outcomes.
const REFILL_RATE = 1; // 1 token per second

let limiter: TokenBucket;
let client: ioredis.Redis;
let timestamp: number;
const user1 = '1';
const user2 = '2';
const user3 = '3';
const user4 = '4';

async function getBucketFromClient(redisClient: ioredis.Redis, uuid: string): Promise<RedisBucket> {
    const res = await redisClient.get(uuid);
    // if no uuid is found, return -1 for tokens and timestamp, which are both impossible
    if (res === null) return { tokens: -1, timestamp: -1 };
    return JSON.parse(res);
}

async function setTokenCountInClient(
    redisClient: ioredis.Redis,
    uuid: string,
    tokens: number,
    time: number
) {
    const value: RedisBucket = { tokens, timestamp: time };
    await redisClient.set(uuid, JSON.stringify(value));
}

describe('Test TokenBucket Rate Limiter', () => {
    beforeEach(async () => {
        // Initialize a new token bucket before each test
        // create a mock user
        // intialze the token bucket algorithm
        client = new RedisMock();
        limiter = new TokenBucket(CAPACITY, REFILL_RATE, client);
        timestamp = new Date().valueOf();
    });

    describe('TokenBucket returns correct number of tokens and updates redis store as expected', () => {
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

        describe('after a BLOCKED request...', () => {
            let redisData: RedisBucket;

            afterAll(() => {
                client.flushall();
            });

            test('where intial request is greater than bucket capacity', async () => {
                // Initial request greater than capacity
                expect((await limiter.processRequest(user1, timestamp, CAPACITY + 1)).tokens).toBe(
                    CAPACITY
                );

                redisData = await getBucketFromClient(client, user1);
                expect(redisData.tokens).toBe(CAPACITY);
            });

            test('Bucket is partially full but not enough time elapsed to complete the request', async () => {
                // Bucket is partially full and time has elapsed but not enough to allow the current request
                const fillLevel = 5;
                const timeDelta = 3;
                const requestedTokens = 9;
                await setTokenCountInClient(client, user2, fillLevel, timestamp);

                expect(
                    (
                        await limiter.processRequest(
                            user2,
                            timestamp + timeDelta * 1000,
                            requestedTokens
                        )
                    ).tokens
                ).toBe(fillLevel + timeDelta * REFILL_RATE);

                redisData = await getBucketFromClient(client, user2);
                expect(redisData.tokens).toBe(fillLevel + timeDelta * REFILL_RATE);
            });
        });
    });

    describe('Token Bucket functions as expected', () => {
        afterEach(() => {
            client.flushall();
        });
        test('allows a user to consume up to their current allotment of tokens', async () => {
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

        test("blocks requests exceeding the user's current allotment of tokens", async () => {
            // Test > capacity tokens reqeusted
            expect((await limiter.processRequest(user1, timestamp, CAPACITY + 1)).success).toBe(
                false
            );

            // Empty user 1's bucket
            const value: RedisBucket = { tokens: 0, timestamp };
            await client.set(user1, JSON.stringify(value));

            // bucket is empty. Shouldn't be allowed to take 1 token
            expect((await limiter.processRequest(user1, timestamp, 1)).success).toBe(false);

            // Should still be allowed to process "free" requests
            expect((await limiter.processRequest(user1, timestamp, 0)).success).toBe(true);
        });

        test('token bucket never exceeds maximum capacity', async () => {
            // make sure bucket doesn't exceed max size without any requests.
            // Fill the user's bucket then request additional tokens after an interval
            const value: RedisBucket = { tokens: CAPACITY, timestamp };
            await client.set(user1, JSON.stringify(value));
            expect(
                (await limiter.processRequest(user1, timestamp + 1000, CAPACITY + 1)).success
            ).toBe(false);
            expect(
                (await limiter.processRequest(user1, timestamp + 10000, CAPACITY + 1)).success
            ).toBe(false);
            expect(
                (await limiter.processRequest(user1, timestamp + 100000, CAPACITY + 1)).success
            ).toBe(false);
        });

        xtest('token bucket refills at specified rate', async () => {
            // make sure bucket refills if user takes tokens.
            const withdraw = 5;
            let timeDelta = 3;
            await limiter.processRequest(user1, timestamp, withdraw); // 5 tokens after this
            expect(
                (
                    await limiter.processRequest(
                        user1,
                        timestamp + timeDelta * 1000, // wait 3 seconds -> 8 tokens available
                        withdraw + REFILL_RATE * timeDelta // 5 + 3 = 8 tokens requested after this , 0 remaining
                    )
                ).tokens
            ).toBe(CAPACITY - withdraw + REFILL_RATE * timeDelta); // 10 - 5 + 3 = 8 ??

            // check if bucket refills completely and doesn't spill over.
            timeDelta = 2 * CAPACITY;
            expect(
                (await limiter.processRequest(user1, timestamp + timeDelta * 1000, CAPACITY + 1))
                    .tokens
            ).toBe(CAPACITY);
        });

        test('bucket allows custom refill rates', async () => {
            const doubleRefillClient: ioredis.Redis = new RedisMock();
            limiter = new TokenBucket(CAPACITY, 2, doubleRefillClient);

            await setTokenCountInClient(doubleRefillClient, user1, 0, timestamp);

            const timeDelta = 5;
            expect(
                (await limiter.processRequest(user1, timestamp + timeDelta * 1000, 0)).tokens
            ).toBe(timeDelta * 2);
        });

        test('users have their own buckets', async () => {
            const requested = 6;
            const user3Tokens = 8;
            // Add tokens for user 3 so we have both a user that exists in the store (3) and one that doesn't (2)
            await setTokenCountInClient(client, user3, user3Tokens, timestamp);

            // issue a request for user 1;
            await limiter.processRequest(user1, timestamp, requested);

            // Check that each user has the expected amount of tokens.
            expect((await getBucketFromClient(client, user1)).tokens).toBe(CAPACITY - requested);
            expect((await getBucketFromClient(client, user2)).tokens).toBe(-1); // not in the store so this returns -1
            expect((await getBucketFromClient(client, user3)).tokens).toBe(user3Tokens);

            await limiter.processRequest(user2, timestamp, 1);
            expect((await getBucketFromClient(client, user1)).tokens).toBe(CAPACITY - requested);
            expect((await getBucketFromClient(client, user2)).tokens).toBe(CAPACITY - 1);
            expect((await getBucketFromClient(client, user3)).tokens).toBe(user3Tokens);
        });

        test('bucket does not allow capacity or refill rate <= 0', () => {
            expect(() => new TokenBucket(0, 1, client)).toThrow(
                'TokenBucket refillRate and capacity must be positive'
            );
            expect(() => new TokenBucket(-10, 1, client)).toThrow(
                'TokenBucket refillRate and capacity must be positive'
            );
            expect(() => new TokenBucket(10, -1, client)).toThrow(
                'TokenBucket refillRate and capacity must be positive'
            );
            expect(() => new TokenBucket(10, 0, client)).toThrow(
                'TokenBucket refillRate and capacity must be positive'
            );
        });

        test('All buckets should be able to be reset', async () => {
            const tokens = 5;
            await setTokenCountInClient(client, user1, tokens, timestamp);
            await setTokenCountInClient(client, user2, tokens, timestamp);
            await setTokenCountInClient(client, user3, tokens, timestamp);

            limiter.reset();

            expect((await limiter.processRequest(user1, timestamp, CAPACITY)).success).toBe(true);
            expect((await limiter.processRequest(user2, timestamp, CAPACITY - 1)).success).toBe(
                true
            );
            expect((await limiter.processRequest(user3, timestamp, CAPACITY + 1)).success).toBe(
                false
            );
        });
    });

    describe('Token Bucket correctly updates redis store', () => {
        test('timestamp correctly updated in redis', async () => {
            let redisData: RedisBucket;

            // blocked request
            await limiter.processRequest(user1, timestamp, CAPACITY + 1);
            redisData = await getBucketFromClient(client, user1);
            expect(redisData.timestamp).toBe(timestamp);

            timestamp += 1000;
            // allowed request
            await limiter.processRequest(user2, timestamp, CAPACITY);
            redisData = await getBucketFromClient(client, user2);
            expect(redisData.timestamp).toBe(timestamp);
        });

        test('All buckets should be able to be reset', async () => {
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
