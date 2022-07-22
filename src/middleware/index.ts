import Redis from 'ioredis';
import { parse, validate } from 'graphql';
import { GraphQLSchema } from 'graphql/type/schema';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import buildTypeWeightsFromSchema, { defaultTypeWeightsConfig } from '../analysis/buildTypeWeights';
import setupRateLimiter from './rateLimiterSetup';
import getQueryTypeComplexity from '../analysis/typeComplexityAnalysis';
import { ExpressMiddlewareConfig, ExpressMiddlewareSet } from '../@types/expressMiddleware';

/**
 * Primary entry point for adding GraphQL Rate Limiting middleware to an Express Server
 * @param {GraphQLSchema} schema GraphQLSchema object
 * @param {ExpressMiddlewareConfig} middlewareConfig
 *      /// "ratelimiter" must be explicitly specified in the setup of the middleware. /n
 *      /// "redis" connection options (https://ioredis.readthedocs.io/en/stable/API/#new_Redis) and an optional "keyExpiry" property (defaults to 24h)
 *      /// "typeWeights" optional type weight configuration for the GraphQL Schema. Developers can override default typeWeights. Defaults to {mutation: 10, query: 1, object: 1, scalar/enum: 0, connection: 2}
 *      /// "dark: true" will run the package in "dark mode" to monitor queries and rate limiting data before implementing rate limitng functionality. Defaults to false
 *      /// "enforceBoundedLists: true" will throw an error if any lists in the schema are not constrained by slicing arguments: Defaults to false
 *      /// "depthLimit: number" will block queries with deeper nesting than the specified depth. Will not block queries by depth by default
 * @returns {RequestHandler} express middleware that computes the complexity of req.query and calls the next middleware
 * if the query is allowed or sends a 429 status if the request is blocked
 * FIXME: How about the specific GraphQLError?
 * @throws ValidationError if GraphQL Schema is invalid.
 */
export default function expressGraphQLRateLimiter(
    schema: GraphQLSchema,
    middlewareConfig: ExpressMiddlewareConfig
): RequestHandler {
    /**
     * Setup the middleware configuration with a passed in and default values
     * - redis "keyExpiry" defaults to 1 day (in ms)
     * - "typeWeights" defaults to defaultTypeWeightsConfig
     * - "dark" and "enforceBoundedLists" default to false
     * - "depthLimit" defaults to Infinity
     */
    const middlewareSetup: ExpressMiddlewareSet = {
        rateLimiter: middlewareConfig.rateLimiter,
        typeWeights: { ...defaultTypeWeightsConfig, ...middlewareConfig.typeWeights },
        redis: {
            keyExpiry: middlewareConfig.redis?.keyExpiry || 86400000,
            options: { ...middlewareConfig.redis?.options },
        },
        dark: middlewareConfig.dark || false,
        enforceBoundedLists: middlewareConfig.enforceBoundedLists || false,
        depthLimit: middlewareConfig.depthLimit || Infinity,
    };
    /**
     * build the type weight object, create the redis client and instantiate the ratelimiter
     * before returning the express middleware that calculates query complexity and throttles the requests
     */
    // TODO: Throw ValidationError if schema is invalid
    const typeWeightObject = buildTypeWeightsFromSchema(schema, middlewareSetup.typeWeights);
    // TODO: Throw error if connection is unsuccessful
    const redisClient = new Redis(); // Default port is 6379 automatically
    const rateLimiter = setupRateLimiter(
        middlewareSetup.rateLimiter,
        redisClient,
        middlewareSetup.redis.keyExpiry
    );

    // return the rate limiting middleware
    return async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void | Response<any, Record<string, any>>> => {
        const requestTimestamp = new Date().valueOf();
        const { query, variables }: { query: string; variables: any } = req.body;
        if (!query) {
            // FIXME: Throw an error here? Code currently passes this on to whatever is next
            console.log('There is no query on the request');
            return next();
        }

        // check for a proxied ip address before using the ip address on request
        const ip: string = req.ips[0] || req.ip;

        const queryAST = parse(query);
        // validate the query against the schema. The GraphQL validation function returns an array of errors.
        const validationErrors = validate(schema, queryAST);
        // check if the length of the returned GraphQL Errors array is greater than zero. If it is, there were errors. Call next so that the GraphQL server can handle those.
        if (validationErrors.length > 0) {
            // FIXME: Customize this error to throw the GraphQLError
            return next(Error('invalid query'));
        }

        const queryComplexity = getQueryTypeComplexity(queryAST, variables, typeWeightObject);
        try {
            // process the request and conditinoally respond to client with status code 429 or
            // pass the request onto the next middleware function
            const rateLimiterResponse = await rateLimiter.processRequest(
                ip,
                requestTimestamp,
                queryComplexity
            );
            res.locals.graphqlGate = {
                timestamp: requestTimestamp,
                complexity: queryComplexity,
                tokens: rateLimiterResponse.tokens,
                success: rateLimiterResponse.success,
                depth: null, // FIXME: update this once depth limiting is enabled
            };
            if (!rateLimiterResponse.success && !middlewareSetup.dark) {
                // TODO: rateLimiter.processRequest response should have a property for retryAfter if the reqest is blocked
                return (
                    res
                        .status(429)
                        // .set('Retry-After', `${timeToWaitInMs}`) // FIXME: pass correct time into this header
                        .json(res.locals.graphqlgate)
                );
            }
            return next();
        } catch (err) {
            // todo: refactor error handling
            return next(err);
        }
    };
}
