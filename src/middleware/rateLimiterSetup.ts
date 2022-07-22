import Redis from 'ioredis';
import { RateLimiterOptions, RateLimiterSelection, TokenBucketOptions } from '../@types/rateLimit';
import SlidingWindowCounter from '../rateLimiters/slidingWindowCounter';
import TokenBucket from '../rateLimiters/tokenBucket';

/**
 * Instatieate the rateLimiting algorithm class based on the developer selection and options
 *
 * @export
 * @param {RateLimiterSelection} selection
 * @param {RateLimiterOptions} options
 * @param {Redis} client
 * @return {*}
 */
export default function setupRateLimiter(
    selection: RateLimiterSelection,
    options: RateLimiterOptions,
    client: Redis
) {
    switch (selection) {
        case 'TOKEN_BUCKET':
            // todo validate options
            //@ts-ignore
            return new TokenBucket(options.bucketSize, options.refillRate, client);
            break;
        case 'LEAKY_BUCKET':
            throw new Error('Leaky Bucket algonithm has not be implemented.');
            break;
        case 'FIXED_WINDOW':
            throw new Error('Fixed Window algonithm has not be implemented.');
            break;
        case 'SLIDING_WINDOW_LOG':
            throw new Error('Sliding Window Log has not be implemented.');
            break;
        case 'SLIDING_WINDOW_COUNTER':
            //@ts-ignore
            return new SlidingWindowCounter(options.windowSize, options.capacity, client);
            break;
        default:
            // typescript should never let us invoke this function with anything other than the options above
            throw new Error('Selected rate limiting algorithm is not suppported');
            break;
    }
}
