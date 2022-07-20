import Redis from 'ioredis';
import { RateLimiterOptions, RateLimiterSelection } from '../@types/rateLimit';
import SlidingWindowLog from '../rateLimiters/slidingWindowLog';
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
            if (options.typename === 'bucket') {
                return new TokenBucket(options.bucketSize, options.refillRate, client);
            }
            throw new Error('Invalid options for token bucket');
        case 'LEAKY_BUCKET':
            throw new Error('Leaky Bucket algonithm has not be implemented.');
        case 'FIXED_WINDOW':
            throw new Error('Fixed Window algonithm has not be implemented.');
        case 'SLIDING_WINDOW_LOG':
            if (options.typename === 'window') {
                return new SlidingWindowLog(options.windowSize, options.capacity, client);
            }
            throw new Error('Invalid options for sliding window log');
        case 'SLIDING_WINDOW_COUNTER':
            throw new Error('Sliding Window Counter algonithm has not be implemented.');
        default:
            // typescript should never let us invoke this function with anything other than the options above
            throw new Error('Selected rate limiting algorithm is not suppported');
    }
}
