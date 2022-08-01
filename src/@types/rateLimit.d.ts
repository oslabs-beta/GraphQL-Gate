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
export interface RedisWindow {
    currentTokens: number;
    // null if limiter is currently on the initial fixed window
    previousTokens?: number | null; // ?
    fixedWindowStart: number;
}

export type RedisLog = RedisBucket[];

type BucketType = 'TOKEN_BUCKET' | 'LEAKY_BUCKET';

type WindowType = 'FIXED_WINDOW' | 'SLIDING_WINDOW_LOG' | 'SLIDING_WINDOW_COUNTER';

type BucketRateLimiter = {
    type: BucketType;
    refillRate: number;
    capacity: number;
};

type WindowRateLimiter = {
    type: WindowType;
    windowSize: number;
    capacity: number;
};

export type RateLimiterConfig = WindowRateLimiter | BucketRateLImiter;
