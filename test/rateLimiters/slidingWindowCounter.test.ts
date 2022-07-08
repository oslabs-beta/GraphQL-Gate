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
    const value: RedisWindow = { tokens, timestamp: time };
    await redisClient.set(uuid, JSON.stringify(value));
}

describe('Test TokenBucket Rate Limiter', () => {
    beforeEach(async () => {
        // Initialize a new token bucket before each test
        // create a mock user
        // intialze the token bucket algorithm
        client = new RedisMock();
        // limiter = new SlidingWindowCounter(WINDOW_SIZE, CAPACITY, client);
        timestamp = new Date().valueOf();
    });

    describe('SlidingWindowCounter returns correct number of tokens and updates redis store as expected', () => {});
});
