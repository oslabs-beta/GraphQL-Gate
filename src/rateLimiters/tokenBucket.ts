/**
 *
 */
class TokenBucket implements RateLimiter {
    capacity: number;

    refillRate: number;

    /**
     * Create a new instance of a TokenBucket rate limiter that can be connected to any database store
     * @param capacity max token bucket capacity
     * @param refillRate rate at which the token bucket is refilled
     */
    constructor(capacity: number, refillRate: number) {
        this.capacity = capacity;
        this.refillRate = refillRate;
    }

    processRequest(uuid: string, tokens?: number): boolean {
        throw Error(`TokenBucket.processRequest not implemented, ${this}`);
    }

    connect(uri: string) {
        throw Error(`TokenBucket.connect not implemented, ${this}`);
    }

    /**
     * @returns current size of the token bucket.
     */
    getSize(uuid: string): number {
        throw Error(`TokenBucket.connect not implemented, ${this}`);
    }
}

export default TokenBucket;
