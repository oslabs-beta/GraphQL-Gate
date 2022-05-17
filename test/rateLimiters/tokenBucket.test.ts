import TokenBucket from '../../src/rateLimiters/tokenBucket';

const CAPACITY = 10;
const REFILL_RATE = 1; // 1 token per second

let limiter: TokenBucket;
let user1;
let user2;
let user3;

xdescribe('Test token bucket functionality', () => {
    beforeAll(() => {
        user1 = '1';
        user2 = '2';
        user3 = '3';
    });

    beforeEach(() => {
        // Initialize a new token bucket before each test
        // create a mock user
        // intialze the token bucket algorithm
        limiter = new TokenBucket(CAPACITY, REFILL_RATE);
    });

    test('allows a user to consume up to their current allotment of tokens', () => {
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

    test("blocks requets exceeding the user's current allotment of tokens", () => {
        // Test > capacity tokens reqeusted
        expect(limiter.processRequest(user1, CAPACITY + 1)).toBe(false);
        // allowed to take full amount
        expect(limiter.processRequest(user1, CAPACITY)).toBe(true);
        // bucket is empty. Shouldn't be allowed to take 1 token
        expect(limiter.processRequest(user1, 1)).toBe(false);
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
        }, (withdraw / REFILL_RATE) * 5000);
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
});
