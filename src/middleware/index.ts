import { RedisClientType } from 'redis';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { GraphQLSchema } from 'graphql/type/schema';
import { defaultTypeWeightsConfig } from '../analysis/buildTypeWeights';

// FIXME: Should redisClient have the option of an under the hood implementation (not provided by user)
// FIXME: Will the developer be responsible for first parsing the schema from a file?
// Can consider accepting a string representing a the filepath to a schema
// FIXME: Should a 429 status be sent by default or do we allow the user to handle blocked requests?

/**
 * Primary entry point for adding GraphQL Rate Limiting middleware to an Express Server
 * @param {RateLimiterSelection} rateLimiter Specify rate limiting algorithm to be used
 * @param {GraphQLSchema} schema GraphQLSchema object
 * @param {RedisClientType} redisClient redis client used for caching user request informaiton
 * @param {TypeWeightConfig} typeWeightConfig Optional type weight configuration for the GraphQL Schema.
 * Defaults to {mutation: 10, object: 1, field: 0, connection: 2}
 * @returns {RequestHandler} express middleware that computes the complexity of req.query and calls the next middleware
 * if the query is allowed or sends a 429 status if the request is blocked
 * @throws ValidationError if GraphQL Schema is invalid
 */
export function expressRateLimiter(
    rateLimiter: RateLimiterSelection,
    schema: GraphQLSchema,
    redisClient: RedisClientType,
    typeWeightConfig: TypeWeightConfig = defaultTypeWeightsConfig
): RequestHandler {
    // TODO: Parse the schema to create a TypeWeightObject. Throw ValidationError if schema is invalid
    // TODO: Configure the selected RateLimtier
    // TODO: Configure the complexity analysis algorithm to run for incoming requests

    const middleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
        // TODO: Parse query from req.query, compute complexity and pass necessary info to rate limiter
        // TODO: Call next if query is successful, send 429 status if query blocked, call next(err) with any thrown errors

        next(Error('Express rate limiting middleware not implemented'));
    };
    return middleware;
}

export default expressRateLimiter;
