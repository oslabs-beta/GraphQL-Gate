import { RedisOptions } from 'ioredis';
import { TypeWeightConfig } from './buildTypeWeights';
import { RateLimiterOptions, RateLimiterSelection } from './rateLimit';

interface RateLimitingOptions {
    type: RateLimiterSelection;
    options: RateLimiterOptions;
}

export interface ExpressMiddlewareConfig {
    rateLimiter: RateLimitingOptions;
    redis?: RedisOptions;
    typeWeights?: TypeWeightConfig;
    dark?: boolean;
    enforceBoundedLists?: boolean;
}

export interface ExpressMiddlewareSet {
    rateLimiter: RateLimitingOptions;
    redis: RedisOptions;
    typeWeights: TypeWeightConfig;
    dark: boolean;
    enforceBoundedLists: boolean;
}
