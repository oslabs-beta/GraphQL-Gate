import Redis from 'ioredis';
import TokenBucket from '../rateLimiters/tokenBucket';

export default function setupRateLimiter(
    selection: RateLimiterSelection,
    options: RateLimiterOptions,
    client: Redis
) {
    switch (selection) {
        case 'TOKEN_BUCKET':
            // todo validate options
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
            throw new Error('Sliding Window Counter algonithm has not be implemented.');
            break;
        default:
            throw new Error('Selected rate limiting algorithm is not suppported');
            break;
    }
}
