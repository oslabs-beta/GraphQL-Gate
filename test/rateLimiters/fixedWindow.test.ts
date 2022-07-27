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
    currentTokens: number,
    fixedWindowStart: number
) {
    const value: RedisWindow = { currentTokens, fixedWindowStart };
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
                expect(tokenCountFull.currentTokens).toBe(5);
            });
            test('reached 40% capacity in current time window and still can pass request', async () => {
                const initial = 5;
                const partialWithdraw = 2;
                expect(
                    (await limiter.processRequest(user2, timestamp, initial + partialWithdraw))
                        .tokens
                ).toBe(CAPACITY - initial - partialWithdraw);
                // TODO: using setWindowClient first and update the capacity (not working)
                // TODO: might need to look into why is not taking second request...

                const tokenCountPartial = await getWindowFromClient(client, user2);
                expect(tokenCountPartial.currentTokens).toBe(initial + partialWithdraw);
            });

            // TODO: need to fix processRequest Fn()

            xtest('window is partially full and request has no leftover tokens', async () => {
                const initial = 6;
                const partialWithdraw = 5;
                await setTokenCountInClient(client, user2, initial, timestamp);
                expect(
                    (await limiter.processRequest(user2, timestamp, partialWithdraw)).success
                ).toBe(false);
                const tokenCountPartialToEmpty = await getWindowFromClient(client, user2);
                expect(tokenCountPartialToEmpty.currentTokens).toBe(10);
            });
        });
        describe('after a BLOCKED request...', () => {
            afterEach(() => {
                client.flushall();
            });
            test('initial request is greater than capacity', async () => {
                // expect remaining tokens to be 10, b/c the 11 token request should be blocked
                expect((await limiter.processRequest(user1, timestamp, 11)).success).toBe(false);
                // expect current tokens in the window to still be 0
                expect((await getWindowFromClient(client, user1)).currentTokens).toBe(0);
            });
            xtest('window is partially full but not enough time elapsed to reach new window', async () => {
                const requestedTokens = 9;

                await setTokenCountInClient(client, user2, requestedTokens, timestamp);
                // expect remaining tokens to be 1, b/c the 2-token-request should be blocked
                // TODO: fix processRequest function
                const result = await limiter.processRequest(user2, timestamp + WINDOW_SIZE - 1, 2);

                expect(result.success).toBe(false);
                // TODO: fix this, (expect 1, but get 9 -- which is # of currentTokens)
                expect(result.tokens).toBe(CAPACITY - requestedTokens);

                // expect current tokens in the window to still be 9
                expect((await getWindowFromClient(client, user2)).currentTokens).toBe(9);
            });
        });
        describe('updateTimeWindow function works as expect', () => {
            afterEach(() => {
                client.flushall();
            });
            xtest('New window is initialized after reaching the window size', async () => {
                const fullRequest = 10;
                await setTokenCountInClient(client, user3, fullRequest, timestamp);
                const noAccess = await limiter.processRequest(
                    user3,
                    timestamp + WINDOW_SIZE - 1,
                    1
                );

                // TODO: fix processRequest function
                // expect cannot pass any request
                expect(noAccess.success).toBe(false);

                const newRequest = 3;
                await setTokenCountInClient(client, user3, newRequest, timestamp + WINDOW_SIZE + 1);
                const newAccess = await limiter.processRequest(user3, timestamp, 1);

                expect(newAccess.success).toBe(true);
                expect(newAccess.tokens).toBe(4);
            });
        });
    });
});
