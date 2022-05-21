interface RateLimiter {
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

interface RateLimiterResponse {
    success: boolean;
    tokens?: number;
}

interface RedisBucket {
    tokens: number;
    timestamp: number;
}

type RateLimiterSelection =
    | 'TOKEN_BUCKET'
    | 'LEAKY_BUCKET'
    | 'FIXED_WINDOW'
    | 'SLIDING_WINDOW_LOG'
    | 'SLIDING_WINDOW_COUNTER';
