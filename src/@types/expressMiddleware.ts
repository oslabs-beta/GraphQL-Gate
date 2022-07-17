import { RedisOptions } from 'ioredis';
import { TypeWeightConfig, TypeWeightSet } from './buildTypeWeights';
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
    depthLimit?: number;
}

export interface ExpressMiddlewareSet {
    rateLimiter: RateLimitingOptions;
    redis: RedisOptions;
    typeWeights: TypeWeightSet;
    dark: boolean;
    enforceBoundedLists: boolean;
    depthLimit: number;
}
