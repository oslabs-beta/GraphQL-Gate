import * as ioredis from 'ioredis';
import { RedisWindow } from '../../src/@types/rateLimit';
import FixedWindow from '../../src/rateLimiters/fixedWindow';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RedisMock = require('ioredis-mock');

const CAPACITY = 10;
const WINDOW_SIZE = 6000;

let limiter: FixedWindow;
let client: ioredis.Redis;
let timestamp: number;
const user1 = '1';
const user2 = '2';
const user3 = '3';
const user4 = '4';

async function getWindowFromClient(redisClient: ioredis.Redis, uuid: string): Promise<RedisWindow> {
    const res = await redisClient.get(uuid);
    // if no uuid is found, return -1 for tokens and timestamp, which are both impossible
    if (res === null) return { currentTokens: -1, fixedWindowStart: -1 };
    return JSON.parse(res);
}

async function setTokenCountInClient(
    redisClient: ioredis.Redis,
    uuid: string,
    tokens: number,
    time: number
) {
    const value: RedisWindow = { currentTokens: tokens, fixedWindowStart: time };
    await redisClient.set(uuid, JSON.stringify(value));
}
describe('Test FixedWindow Rate Limiter', () => {
    beforeEach(async () => {
        client = new RedisMock();
        limiter = new FixedWindow(CAPACITY, WINDOW_SIZE, client);
        timestamp = new Date().valueOf();
    });
    describe('FixedWindow returns correct number of tokens and updates redis store as expected', () => {
        describe('after an ALLOWED request...', () => {
            afterEach(() => {
                client.flushall();
            });
            test('current time window has no token initially', async () => {
                // zero token used in this time window
                const withdraw5 = 5;
                expect((await limiter.processRequest(user1, timestamp, withdraw5)).tokens).toBe(
                    CAPACITY - withdraw5
                );
                const tokenCountFull = await getWindowFromClient(client, user1);
                expect(tokenCountFull.currentTokens).toBe(CAPACITY - withdraw5);
            });
        });
    });
});
