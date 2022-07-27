import Redis from 'ioredis';
import { RateLimiterConfig } from '../@types/rateLimit';
import TokenBucket from '../rateLimiters/tokenBucket';
import SlidingWindowCounter from '../rateLimiters/slidingWindowCounter';
import SlidingWindowLog from '../rateLimiters/slidingWindowLog';

/**
 * Instatieate the rateLimiting algorithm class based on the developer selection and options
 *
 * @export
 * @param {RateLimiterConfig} rateLimiter limiter selection and option
 * @param {Redis} client
 * @param {number} keyExpiry
 * @return {*}
 */
export default function setupRateLimiter(
    rateLimiter: RateLimiterConfig,
    client: Redis,
    keyExpiry: number
) {
    switch (rateLimiter.type) {
        case 'TOKEN_BUCKET':
            return new TokenBucket(rateLimiter.capacity, rateLimiter.refillRate, client, keyExpiry);
            break;
        case 'LEAKY_BUCKET':
            throw new Error('Leaky Bucket algonithm has not be implemented.');
        case 'FIXED_WINDOW':
            throw new Error('Fixed Window algonithm has not be implemented.');
        case 'SLIDING_WINDOW_LOG':
            return new SlidingWindowLog(
                rateLimiter.windowSize,
                rateLimiter.capacity,
                client,
                keyExpiry
            );
        case 'SLIDING_WINDOW_COUNTER':
            return new SlidingWindowCounter(
                rateLimiter.windowSize,
                rateLimiter.capacity,
                client,
                keyExpiry
            );
            break;
        default:
            // typescript should never let us invoke this function with anything other than the options above
            throw new Error('Selected rate limiting algorithm is not suppported');
    }
}
