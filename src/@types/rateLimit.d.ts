export interface RateLimiter {
    /**
     * Checks if a request is allowed under the given conditions and withdraws the specified number of tokens
     * @param uuid Unique identifier for the user associated with the request
     * @param timestamp UNIX format timestamp of when request was received
     * @param tokens Number of tokens being used in this request. Optional
     * @returns a RateLimiterResponse indicating with a sucess and tokens property indicating the number of tokens remaining
     */
    processRequest: (
        uuid: string,
        timestamp: number,
        tokens?: number
    ) => Promise<RateLimiterResponse>;
}

export interface RateLimiterResponse {
    success: boolean;
    tokens: number;
    retryAfter?: number;
}

export interface RedisBucket {
    tokens: number;
    timestamp: number;
}

export interface FixedWindow {
    currentTokens: number;
    fixedWindowStart: number;
}
export interface RedisWindow extends FixedWindow {
    previousTokens: number;
}

export type RedisLog = RedisBucket[];

export type RateLimiterSelection =
    | 'TOKEN_BUCKET'
    | 'LEAKY_BUCKET'
    | 'FIXED_WINDOW'
    | 'SLIDING_WINDOW_LOG'
    | 'SLIDING_WINDOW_COUNTER';

/**
 * @type {number} bucketSize - Size of the token bucket
 * @type {number} refillRate - Rate at which tokens are added to the bucket in seconds
 */
export interface TokenBucketOptions {
    bucketSize: number;
    refillRate: number;
}

/**
 * @type {number} windowSize - size of the window in milliseconds
 * @type {number} capacity - max number of tokens that can be used in the bucket
 */
export interface WindowOptions {
    windowSize: number;
    capacity: number;
}

// TODO: This will be a union type where we can specify Option types for other Rate Limiters
// Record<string, never> represents the empty object for algorithms that don't require settings
// and might be able to be removed in the future.
export type RateLimiterOptions = TokenBucketOptions | Record<string, never>;
