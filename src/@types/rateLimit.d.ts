interface RateLimiter {
    /**
     * Checks if a request is allowed under the given conditions and withdraws the specified number of tokens
     * @param uuid Unique identifier for the user associated with the request
     * @param tokens Number of tokens being used in this request. Optional
     * @returns true if the request is allowed
     */
    processRequest: (uuid: string, tokens?: number) => boolean;
    /**
     * Connects the RateLimiter instance to a db to cache current token usage for connected users
     * @param uri database connection string
     */
    connect: (uri: string) => void;
}
