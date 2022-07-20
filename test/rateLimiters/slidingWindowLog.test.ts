import 'ts-jest';
import * as ioredis from 'ioredis';
import { RateLimiterResponse, RedisLog } from '../../src/@types/rateLimit';
import SlidingWindowLog from '../../src/rateLimiters/slidingWindowLog';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RedisMock = require('ioredis-mock');

const WINDOW_SIZE = 1000;
const CAPACITY = 10;

let limiter: SlidingWindowLog;
let client: ioredis.Redis;
let timestamp: number;
const user1 = '1';
const user2 = '2';
const user3 = '3';

async function getLogFromClient(redisClient: ioredis.Redis, uuid: string): Promise<RedisLog> {
    const res = await redisClient.get(uuid);
    // if no uuid is found, return -1 for tokens and timestamp, which are both impossible
    if (res === null) return [];
    return JSON.parse(res);
}

async function setLogInClient(redisClient: ioredis.Redis, uuid: string, log: RedisLog) {
    await redisClient.set(uuid, JSON.stringify(log));
}

/**
 * Strategy
 *
 * Log and Redis updates
 *  Doesn't exist
 *    1. Request with complexity 0 => allowed.
 *    2. Request with complexity < capacity => allowed
 *    3. Request with complexity = capacity => allowed
 *    4. Request with complexity > capacity => blocked
 *  Empty
 *    1. Request with complexity 0 => allowed.
 *    2. Request with complexity < capacity => allowed
 *    3. Request with complexity = capacity => allowed
 *    4. Request with complexity > capacity => blocked
 *  Contains active requests (still in window)
 *    1. sum of requests = capacity => blocked
 *    2. sum of request < capacity
 *      1. current request complexity small enough => allowed
 *      1. current request complexity remaining complexity  => allowed TODO:
 *      2. current request complexity to big => blocked
 *      3. current request complexity = 0 => allowed
 *  Contains expired requests (no longer in the window)
 *    1. Request with complexity 0 => allowed.
 *    2. Request with complexity < capacity => allowed
 *    3. Request with complexity = capacity => allowed
 *    4. Request with complexity > capacity => blocked
 *  Contains active and expired requests (both in and out of the window)
 *    1. Request with complexity 0 => allowed.
 *    2. Request with complexity < capacity => allowed
 *    3. Request with complexity = remaining capacity => allowed
 *    4. Request with complexity > capacity => blocked
 *
 * RateLimiter Functionality
 *   User Buckets are unique
 *
 * Config:
 *  Capacity and Window Size must be positive
 *  Custom capacity and window size allowed
 *
 *
 * reset()
 *  flushes all data from the redis store
 */

describe('SlidingWindowLog Rate Limiter', () => {
    beforeAll(() => {
        client = new RedisMock();
    });

    beforeEach(() => {
        limiter = new SlidingWindowLog(WINDOW_SIZE, CAPACITY, client);
        timestamp = new Date().valueOf();
    });

    afterEach(async () => {
        await client.flushall();
    });

    describe('correctly limits requests and updates redis when...', () => {
        describe('the redis log is empty, does not exist, or only contains expired requests', () => {
            // User 1 => no log exists
            let user1Response: RateLimiterResponse;
            let user1Log: RedisLog;
            // User 2 => empty log
            let user2Response: RateLimiterResponse;
            let user2Log: RedisLog;
            // User 3 => log has expired requests
            let user3Response: RateLimiterResponse;
            let user3Log: RedisLog;

            beforeEach(async () => {
                await setLogInClient(client, user2, []);
                const user3Timestamps = [
                    timestamp - 2 * WINDOW_SIZE,
                    timestamp - WINDOW_SIZE - 1,
                    timestamp - WINDOW_SIZE,
                ];
                await setLogInClient(
                    client,
                    user3,
                    user3Timestamps.map((time, i) => ({ timestamp: time, tokens: i + 1 }))
                );
            });

            test('and the request complexity is zero', async () => {
                [user1Response, user2Response, user3Response] = await Promise.all([
                    limiter.processRequest(user1, timestamp, 0),
                    limiter.processRequest(user2, timestamp, 0),
                    limiter.processRequest(user3, timestamp, 0),
                ]);

                // Check the received response
                const expectedResponse: RateLimiterResponse = { tokens: 10, success: true };
                expect(user1Response).toEqual(expectedResponse);
                expect(user2Response).toEqual(expectedResponse);
                expect(user3Response).toEqual(expectedResponse);

                // Check that redis is correctly updated.
                [user1Log, user2Log, user3Log] = await Promise.all([
                    getLogFromClient(client, user1),
                    getLogFromClient(client, user2),
                    getLogFromClient(client, user3),
                ]);
                expect(user1Log).toEqual([]);
                expect(user2Log).toEqual([]);
                expect(user3Log).toEqual([]);
            });
            test('and the request complexity is less than the capacity', async () => {
                const user1Tokens = 3;
                const user2Tokens = 4;
                const user3Tokens = 2;
                [user1Response, user2Response, user3Response] = await Promise.all([
                    limiter.processRequest(user1, timestamp, user1Tokens),
                    limiter.processRequest(user2, timestamp, user2Tokens),
                    limiter.processRequest(user3, timestamp, user3Tokens),
                ]);

                // Check the received response
                expect(user1Response).toEqual({ tokens: CAPACITY - user1Tokens, success: true });
                expect(user2Response).toEqual({ tokens: CAPACITY - user2Tokens, success: true });
                expect(user3Response).toEqual({ tokens: CAPACITY - user3Tokens, success: true });

                // Check that redis is correctly updated.
                [user1Log, user2Log, user3Log] = await Promise.all([
                    getLogFromClient(client, user1),
                    getLogFromClient(client, user2),
                    getLogFromClient(client, user3),
                ]);
                expect(user1Log).toEqual([{ timestamp, tokens: user1Tokens }]);
                expect(user2Log).toEqual([{ timestamp, tokens: user2Tokens }]);
                expect(user3Log).toEqual([{ timestamp, tokens: user3Tokens }]);
            });
            test('and the request complexity is equal to the capacity', async () => {
                const user1Tokens = CAPACITY;
                const user2Tokens = CAPACITY;
                const user3Tokens = CAPACITY;

                [user1Response, user2Response, user3Response] = await Promise.all([
                    limiter.processRequest(user1, timestamp, user1Tokens),
                    limiter.processRequest(user2, timestamp, user2Tokens),
                    limiter.processRequest(user3, timestamp, user3Tokens),
                ]);

                // Check the received response
                const expectedResponse: RateLimiterResponse = { tokens: 0, success: true };
                expect(user1Response).toEqual(expectedResponse);
                expect(user2Response).toEqual(expectedResponse);
                expect(user3Response).toEqual(expectedResponse);

                // Check that redis is correctly updated.
                [user1Log, user2Log, user3Log] = await Promise.all([
                    getLogFromClient(client, user1),
                    getLogFromClient(client, user2),
                    getLogFromClient(client, user3),
                ]);
                expect(user1Log).toEqual([{ timestamp, tokens: user1Tokens }]);
                expect(user2Log).toEqual([{ timestamp, tokens: user2Tokens }]);
                expect(user3Log).toEqual([{ timestamp, tokens: user3Tokens }]);
            });
            test('and the request complexity is greater than the capacity', async () => {
                const user1Tokens = CAPACITY + 1;
                const user2Tokens = CAPACITY + 1;
                const user3Tokens = CAPACITY + 1;

                [user1Response, user2Response, user3Response] = await Promise.all([
                    limiter.processRequest(user1, timestamp, user1Tokens),
                    limiter.processRequest(user2, timestamp, user2Tokens),
                    limiter.processRequest(user3, timestamp, user3Tokens),
                ]);

                // Check the received response
                const expectedResponse: RateLimiterResponse = {
                    tokens: CAPACITY,
                    success: false,
                    retryAfter: Infinity,
                };
                expect(user1Response).toEqual(expectedResponse);
                expect(user2Response).toEqual(expectedResponse);
                expect(user3Response).toEqual(expectedResponse);

                // Check that redis is correctly updated.
                [user1Log, user2Log, user3Log] = await Promise.all([
                    getLogFromClient(client, user1),
                    getLogFromClient(client, user2),
                    getLogFromClient(client, user3),
                ]);
                expect(user1Log).toEqual([]);
                expect(user2Log).toEqual([]);
                expect(user3Log).toEqual([]);
            });
        });

        describe('the redis log contains active requests in the window when...', () => {
            test('the sum of requests is equal to capacity', async () => {
                // add 2 requests to the redis store 3, 7
                const initialLog = [
                    { timestamp, tokens: 3 },
                    { timestamp: timestamp + 100, tokens: 7 },
                ];
                await setLogInClient(client, user1, initialLog);

                timestamp += 100;
                const response: RateLimiterResponse = await limiter.processRequest(
                    user1,
                    timestamp,
                    1
                );

                expect(response.tokens).toBe(0);
                expect(response.success).toBe(false);

                const redisLog = await getLogFromClient(client, user1);
                expect(redisLog).toEqual(initialLog);
            });
            describe('the sum of requests is less than capacity and..', () => {
                let initialLog: RedisLog;
                let initialTokenSum = 0;

                beforeAll(() => {
                    initialLog = [
                        { timestamp, tokens: 3 },
                        { timestamp: timestamp + 100, tokens: 4 },
                    ];
                    initialTokenSum = 7;
                });

                beforeEach(async () => {
                    await setLogInClient(client, user1, initialLog);
                    timestamp += 200;
                });
                test('the current request complexity is small enough to be allowed', async () => {
                    const tokens = 2;
                    const response: RateLimiterResponse = await limiter.processRequest(
                        user1,
                        timestamp,
                        tokens
                    );

                    expect(response.tokens).toBe(CAPACITY - (initialTokenSum + tokens));
                    expect(response.success).toBe(true);

                    const redisLog = await getLogFromClient(client, user1);

                    expect(redisLog).toEqual([...initialLog, { timestamp, tokens }]);
                });

                test('the current request has complexity = remaining capacity', async () => {
                    const tokens = 3;
                    const response: RateLimiterResponse = await limiter.processRequest(
                        user1,
                        timestamp,
                        tokens
                    );

                    expect(response.tokens).toBe(CAPACITY - (initialTokenSum + tokens));
                    expect(response.success).toBe(true);

                    const redisLog = await getLogFromClient(client, user1);

                    expect(redisLog).toEqual([...initialLog, { timestamp, tokens }]);
                });
                test('the current request complexity to big to be allowed', async () => {
                    const tokens = 4;
                    const response: RateLimiterResponse = await limiter.processRequest(
                        user1,
                        timestamp,
                        tokens
                    );

                    expect(response.tokens).toBe(CAPACITY - initialTokenSum);
                    expect(response.success).toBe(false);

                    const redisLog = await getLogFromClient(client, user1);

                    expect(redisLog).toEqual(initialLog);
                });
                test('the current request complexity = 0', async () => {
                    const tokens = 0;
                    const response: RateLimiterResponse = await limiter.processRequest(
                        user1,
                        timestamp,
                        tokens
                    );

                    expect(response.tokens).toBe(CAPACITY - initialTokenSum);
                    expect(response.success).toBe(true);

                    const redisLog = await getLogFromClient(client, user1);

                    expect(redisLog).toEqual(initialLog);
                });
            });
        });

        describe('the redis log contains active and expired requests when...', () => {
            // Current request is sent at timestamp + 1.5 * WINDOW_SIZE (1500)
            let initialLog: RedisLog;
            let activeLog: RedisLog;
            let activeTokenSum = 0;

            beforeAll(() => {
                initialLog = [
                    { timestamp, tokens: 1 }, // expired
                    { timestamp: timestamp + 100, tokens: 2 }, // expired
                    { timestamp: timestamp + 600, tokens: 3 }, // active
                    { timestamp: timestamp + 700, tokens: 4 }, // active
                ];
                activeLog = initialLog.slice(2);
                activeTokenSum = 7;
            });

            beforeEach(async () => {
                await setLogInClient(client, user1, initialLog);
                timestamp += 1500;
            });

            test('the current request has complexity 0', async () => {
                const response: RateLimiterResponse = await limiter.processRequest(
                    user1,
                    timestamp,
                    0
                );

                expect(response.tokens).toBe(CAPACITY - activeTokenSum);
                expect(response.success).toBe(true);

                const redisLog = await getLogFromClient(client, user1);

                expect(redisLog).toEqual(activeLog);
            });
            test('the current request has complexity < capacity', async () => {
                const tokens = 2;
                const response: RateLimiterResponse = await limiter.processRequest(
                    user1,
                    timestamp,
                    tokens
                );

                expect(response.tokens).toBe(CAPACITY - (activeTokenSum + tokens));
                expect(response.success).toBe(true);

                const redisLog = await getLogFromClient(client, user1);

                expect(redisLog).toEqual([...activeLog, { timestamp, tokens }]);
            });
            test('the current request has complexity = remaining capacity', async () => {
                const tokens = 3;
                const response: RateLimiterResponse = await limiter.processRequest(
                    user1,
                    timestamp,
                    tokens
                );

                expect(response.tokens).toBe(CAPACITY - (activeTokenSum + tokens));
                expect(response.success).toBe(true);

                const redisLog = await getLogFromClient(client, user1);

                expect(redisLog).toEqual([...activeLog, { timestamp, tokens }]);
            });
            test('the current request has complexity > capacity => blocked', async () => {
                const tokens = 4;
                const response: RateLimiterResponse = await limiter.processRequest(
                    user1,
                    timestamp,
                    tokens
                );

                expect(response.tokens).toBe(CAPACITY - activeTokenSum);
                expect(response.success).toBe(false);

                const redisLog = await getLogFromClient(client, user1);

                expect(redisLog).toEqual(activeLog);
            });
        });

        test('the log contains a request on a window boundary', async () => {
            const initialLog = [{ timestamp, tokens: CAPACITY }];

            await setLogInClient(client, user1, initialLog);

            // Should not be allowed to perform any requests inside the indow
            const inWindowRequest = await limiter.processRequest(
                user1,
                timestamp + WINDOW_SIZE - 1,
                1
            );
            expect(inWindowRequest.success).toBe(false);
            const startNewWindowRequest = await limiter.processRequest(
                user1,
                timestamp + WINDOW_SIZE,
                1
            );
            expect(startNewWindowRequest.success).toBe(true);
        });
    });

    describe('returns "retryAfter" if a request fails and', () => {
        /**
         * Strategy
         * Check where limitint request is at either end  of log and in the middle
         * Infinity if > capacity (handled above)
         * doesn't appear if success (handled above)
         * */
        beforeEach(() => {
            timestamp = 1000;
        });

        test('the limiting request was is at the beginning of the log', async () => {
            const requestLog = [
                { timestamp, tokens: 9 }, // limiting request
                { timestamp: timestamp + 100, tokens: 1 }, // newer request
            ];
            await setLogInClient(client, user1, requestLog);
            const { retryAfter } = await limiter.processRequest(user1, timestamp + 200, 9);
            expect(retryAfter).toBe(timestamp + WINDOW_SIZE);
        });

        test('the limiting request was is at the end of the log', async () => {
            const requestLog = [
                { timestamp, tokens: 1 }, // older request
                { timestamp: timestamp + 100, tokens: 9 }, // limiting request
            ];
            await setLogInClient(client, user1, requestLog);
            const { retryAfter } = await limiter.processRequest(user1, timestamp + 200, 9);
            expect(retryAfter).toBe(timestamp + 100 + WINDOW_SIZE);
        });

        test('the limiting request was is the middle of the log', async () => {
            const requestLog = [
                { timestamp, tokens: 1 }, // older request
                { timestamp: timestamp + 100, tokens: 8 }, // limiting request
                { timestamp: timestamp + 200, tokens: 1 }, // newer request
            ];
            await setLogInClient(client, user1, requestLog);
            const { retryAfter } = await limiter.processRequest(user1, timestamp + 200, 9);
            expect(retryAfter).toBe(timestamp + 100 + WINDOW_SIZE);
        });
    });
    xtest('users have their own logs', async () => {
        const requested = 6;
        const user3Tokens = 8;
        // // Add log for user 3 so we have both a user that exists in the store (3) and one that doesn't (2)
        await setLogInClient(client, user3, [{ tokens: user3Tokens, timestamp }]);

        // // issue a request for user 1;
        await limiter.processRequest(user1, timestamp + 100, requested);

        // // Check that each user has the expected log
        expect(await getLogFromClient(client, user1)).toEqual({
            timestamp: timestamp + 100,
            tokens: requested,
        });
        expect(await getLogFromClient(client, user2)).toEqual([]);
        expect(await getLogFromClient(client, user3)).toEqual([{ timestamp, tokens: requested }]);

        await limiter.processRequest(user2, timestamp + 200, 1);
        expect(await getLogFromClient(client, user1)).toEqual([
            {
                timestamp: timestamp + 100,
                tokens: requested,
            },
        ]);
        expect(await getLogFromClient(client, user2)).toEqual([
            {
                timestamp: timestamp + 200,
                tokens: 1,
            },
        ]);
        expect(await getLogFromClient(client, user3)).toEqual([{ timestamp, tokens: requested }]);
    });

    test('is able to be reset', async () => {
        const tokens = 5;
        await setLogInClient(client, user1, [{ tokens, timestamp }]);
        await setLogInClient(client, user2, [{ tokens, timestamp }]);
        await setLogInClient(client, user3, [{ tokens, timestamp }]);

        limiter.reset();

        expect(getLogFromClient(client, user1)).resolves.toEqual([]);
        expect(getLogFromClient(client, user2)).resolves.toEqual([]);
        expect(getLogFromClient(client, user3)).resolves.toEqual([]);

        expect((await limiter.processRequest(user1, timestamp, CAPACITY)).success).toBe(true);
        expect((await limiter.processRequest(user2, timestamp, CAPACITY - 1)).success).toBe(true);
        expect((await limiter.processRequest(user3, timestamp, CAPACITY + 1)).success).toBe(false);
    });

    describe('is configurable...', () => {
        test('does not allow capacity or window size <= 0', () => {
            expect(() => new SlidingWindowLog(0, 1, client)).toThrow(
                'SlidingWindowLog window size and capacity must be positive'
            );
            expect(() => new SlidingWindowLog(-10, 1, client)).toThrow(
                'SlidingWindowLog window size and capacity must be positive'
            );
            expect(() => new SlidingWindowLog(10, -1, client)).toThrow(
                'SlidingWindowLog window size and capacity must be positive'
            );
            expect(() => new SlidingWindowLog(10, 0, client)).toThrow(
                'SlidingWindowLog window size and capacity must be positive'
            );
        });

        xtest('...allows custom window size and capacity', async () => {
            const customWindow = 500;
            const customSizelimiter = new SlidingWindowLog(customWindow, CAPACITY, client);

            let customSizeSuccess = await customSizelimiter
                .processRequest(user1, timestamp, CAPACITY)
                .then((res) => res.success);
            expect(customSizeSuccess).toBe(true);

            customSizeSuccess = await customSizelimiter
                .processRequest(user1, timestamp + 100, CAPACITY)
                .then((res) => res.success);
            expect(customSizeSuccess).toBe(false);

            customSizeSuccess = await customSizelimiter
                .processRequest(user1, timestamp + customWindow, CAPACITY)
                .then((res) => res.success);

            const customCapacitylimiter = new SlidingWindowLog(WINDOW_SIZE, 5, client);
            const customCapacity = 5;

            let customWindowSuccess = await customCapacitylimiter
                .processRequest(user1, timestamp, customCapacity + 1)
                .then((res) => res.success);
            expect(customSizeSuccess).toBe(false);

            customWindowSuccess = await customCapacitylimiter
                .processRequest(user1, timestamp + 100, customCapacity)
                .then((res) => res.success);
            expect(customWindowSuccess).toBe(true);
        });
    });
});
