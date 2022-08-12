import EventEmitter from 'events';

import Redis from 'ioredis';

import { RateLimiter, RateLimiterConfig, RateLimiterResponse } from '../@types/rateLimit';
import TokenBucket from '../rateLimiters/tokenBucket';
import SlidingWindowCounter from '../rateLimiters/slidingWindowCounter';
import SlidingWindowLog from '../rateLimiters/slidingWindowLog';
import FixedWindow from '../rateLimiters/fixedWindow';

/**
 * Instatieate the rateLimiting algorithm class based on the developer selection and options
 *
 * @export
 * @param {RateLimiterConfig} rateLimiterConfig limiter selection and option
 * @param {Redis} client
 * @param {number} keyExpiry
 * @return {RateLimiter}
 */
export default function setupRateLimiter(
    rateLimiterConfig: RateLimiterConfig,
    client: Redis,
    keyExpiry: number
): RateLimiter {
    let rateLimiter: RateLimiter;

    try {
        switch (rateLimiterConfig.type) {
            case 'TOKEN_BUCKET':
                rateLimiter = new TokenBucket(
                    rateLimiterConfig.capacity,
                    rateLimiterConfig.refillRate,
                    client,
                    keyExpiry
                );
                break;
            case 'LEAKY_BUCKET':
                throw new Error('Leaky Bucket algonithm has not be implemented.');
            case 'FIXED_WINDOW':
                rateLimiter = new FixedWindow(
                    rateLimiterConfig.capacity,
                    rateLimiterConfig.windowSize,
                    client,
                    keyExpiry
                );
                break;
            case 'SLIDING_WINDOW_LOG':
                rateLimiter = new SlidingWindowLog(
                    rateLimiterConfig.windowSize,
                    rateLimiterConfig.capacity,
                    client,
                    keyExpiry
                );
                break;
            case 'SLIDING_WINDOW_COUNTER':
                rateLimiter = new SlidingWindowCounter(
                    rateLimiterConfig.windowSize,
                    rateLimiterConfig.capacity,
                    client,
                    keyExpiry
                );
                break;
            default:
                // typescript should never let us invoke this function with anything other than the options above
                throw new Error('Selected rate limiting algorithm is not suppported');
        }

        const processRequest = rateLimiter.processRequest.bind(rateLimiter);

        /**
         * We are using a queue and event emitter to handle situations where a user has two concurrent requests being processed.
         * The trailing request will be added to the queue to and await the prior request processing by the rate-limiter
         * This will maintain the consistency and accuracy of the cache when under load from one user
         */
        // stores request IDs for each user in an array to be processed
        const requestQueues: { [index: string]: string[] } = {};
        // Manages processing of requests queue
        const requestEvents = new EventEmitter();

        // processes requests (by resolving  promises) that have been throttled by throttledProcess
        // eslint-disable-next-line no-inner-declarations
        async function processRequestResolver(
            userId: string,
            timestamp: number,
            tokens: number,
            resolve: (value: RateLimiterResponse | PromiseLike<RateLimiterResponse>) => void,
            reject: (reason: unknown) => void
        ) {
            try {
                const response = await processRequest(userId, timestamp, tokens);
                requestQueues[userId] = requestQueues[userId].slice(1);
                resolve(response);
                // trigger the next event and delete the request queue for this user if there are no more requests to process
                requestEvents.emit(requestQueues[userId][0]);
                if (requestQueues[userId].length === 0) delete requestQueues[userId];
            } catch (err) {
                reject(err);
            }
        }

        /**
         * Throttle rateLimiter.processRequest based on user IP to prevent inaccurate redis reads
         * Throttling is based on a event driven promise fulfillment approach.
         * Each time a request is received a promise is added to the user's request queue. The promise "subscribes"
         * to the previous request in the user's queue then calls processRequest and resolves once the previous request
         * is complete.
         * @param userId
         * @param timestamp
         * @param tokens
         * @returns
         */
        // eslint-disable-next-line no-inner-declarations
        async function throttledProcess(
            userId: string,
            timestamp: number,
            tokens = 1
        ): Promise<RateLimiterResponse> {
            // Alternatively use crypto.randomUUID() to generate a random uuid
            const requestId = `${timestamp}${tokens}`;

            if (!requestQueues[userId]) {
                requestQueues[userId] = [];
            }
            requestQueues[userId].push(requestId);

            return new Promise((resolve, reject) => {
                if (requestQueues[userId].length > 1) {
                    requestEvents.once(requestId, async () => {
                        await processRequestResolver(userId, timestamp, tokens, resolve, reject);
                    });
                } else {
                    processRequestResolver(userId, timestamp, tokens, resolve, reject);
                }
            });
        }

        rateLimiter.processRequest = throttledProcess;
        return rateLimiter;
    } catch (err) {
        throw new Error(`Error in expressGraphQLRateLimiter setting up rate-limiter: ${err}`);
    }
}
