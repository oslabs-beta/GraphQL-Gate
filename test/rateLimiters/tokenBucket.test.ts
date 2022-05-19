import redis from 'redis-mock';
import { RedisClientType } from 'redis';
import TokenBucket from '../../src/rateLimiters/tokenBucket';

const CAPACITY = 10;
const REFILL_RATE = 1; // 1 token per second

let limiter: TokenBucket;
let client: RedisClientType;
let user1: string;
let user2: string;
let user3: string;

xdescribe('Test token bucket functionality', () => {
    beforeAll(() => {
        user1 = '1';
        user2 = '2';
        user3 = '3';
    });

    beforeEach(async () => {
        // Initialize a new token bucket before each test
        // create a mock user
        // intialze the token bucket algorithm
        client = redis.createClient();
        await client.connect();
        limiter = new TokenBucket(CAPACITY, REFILL_RATE, client);
    });

    test('allows a user to consume up to their current allotment of tokens', () => {
        // "free requests"
        expect(limiter.processRequest(user1, 0)).toBe(true);
        // Test 1 token requested
        expect(limiter.processRequest(user1, 1)).toBe(true);
        // Test < CAPACITY tokens requested
        expect(limiter.processRequest(user2, CAPACITY - 1)).toBe(true);
        // <= CAPACITY tokens requested
        expect(limiter.processRequest(user3, CAPACITY)).toBe(true);

        setTimeout(() => {
            // make sure user doesn't get extra tokens
            expect(limiter.processRequest(user1, CAPACITY + 1)).toBe(false);
        }, 1000);
    });

    test("blocks requets exceeding the user's current allotment of tokens", async () => {
        // Test > capacity tokens reqeusted
        expect(limiter.processRequest(user1, CAPACITY + 1)).toBe(false);

        // Empty user 1's bucket
        // FIXME: What server time should we use? In what format will it be stored.
        const currentServerTime = await client.time();
        const timestamp = currentServerTime.microseconds;
        const value: RedisToken = { tokens: 0, timestamp };
        await client.set(user1, JSON.stringify(value));

        // bucket is empty. Shouldn't be allowed to take 1 token
        expect(limiter.processRequest(user1, 1)).toBe(false);

        // Should still be allowed to process "free" requests
        expect(limiter.processRequest(user1, 0)).toBe(true);
    });

    test('token bucket never exceeds maximum capacity', () => {
        // initial capacity should be max
        expect(limiter.getSize(user1)).toBe(CAPACITY);
        // make sure bucket doesn't exceed max size without any requests.
        setTimeout(() => {
            expect(limiter.getSize(user1)).toBe(CAPACITY);
        }, 1000);

        // make sure bucket refills if user takes tokens.
        const withdraw = 5;
        limiter.processRequest(user1, withdraw);
        expect(limiter.getSize(user1)).toBe(CAPACITY - withdraw);
        setTimeout(() => {
            expect(limiter.getSize(user1)).toBe(CAPACITY - withdraw + REFILL_RATE);
        }, 1000);

        // check if bucket refills completely and doesn't spill over.
        setTimeout(() => {
            expect(limiter.getSize(user1)).toBe(CAPACITY);
        }, Math.ceil(withdraw / REFILL_RATE) * 1000);
    });

    test('users have their own buckets', () => {
        limiter.processRequest(user1, CAPACITY);
        expect(limiter.getSize(user1)).toBe(0);
        expect(limiter.getSize(user2)).toBe(CAPACITY);
        expect(limiter.getSize(user3)).toBe(CAPACITY);

        limiter.processRequest(user2, 1);
        expect(limiter.getSize(user1)).toBe(0);
        expect(limiter.getSize(user2)).toBe(CAPACITY - 1);
        expect(limiter.getSize(user3)).toBe(CAPACITY);
    });

    test('bucket does not allow negative capacity or refill rate <= 0', () => {
        expect(new TokenBucket(-10, 1, client)).toThrowError();
        expect(new TokenBucket(10, -1, client)).toThrowError();
        expect(new TokenBucket(10, 0, client)).toThrowError();
    });

    test('bucket allows custom refill rates', async () => {
        const doubleRefillClient: RedisClientType = redis.createClient();
        await doubleRefillClient.connect();
        limiter = new TokenBucket(CAPACITY, 2, doubleRefillClient);

        const timestamp = await doubleRefillClient.time().then((time) => time.microseconds);
        const value: RedisToken = { tokens: 0, timestamp };
        await client.set(user1, JSON.stringify(value));

        setInterval(() => {
            expect(limiter.processRequest(user1, 2)).toBeTruthy();
        }, 1000);
    });
});
