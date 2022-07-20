import { RedisOptions } from 'ioredis';
import { TypeWeightConfig, TypeWeightSet } from './buildTypeWeights';
import { RateLimiterOptions, RateLimiterSelection } from './rateLimit';

interface RateLimitingOptions {
    type: RateLimiterSelection;
    options: RateLimiterOptions;
}

// extend ioredis configuration options to include an expiry prooperty for rate limiting cache
interface RedisConfig {
    keyExpiry?: number;
    options?: RedisOptions;
}
// extend the redis config type to have keyExpiry set once configured in the middleware
interface RedisConfigSet extends RedisConfig {
    keyExpiry: number;
    options: RedisOptions;
}

export interface ExpressMiddlewareConfig {
    rateLimiter: RateLimitingOptions;
    redis?: RedisConfig;
    typeWeights?: TypeWeightConfig;
    dark?: boolean;
    enforceBoundedLists?: boolean;
    depthLimit?: number;
}

export interface ExpressMiddlewareSet extends ExpressMiddlewareConfig {
    redis: RedisConfigSet;
    typeWeights: TypeWeightSet;
    dark: boolean;
    enforceBoundedLists: boolean;
    depthLimit: number;
}
