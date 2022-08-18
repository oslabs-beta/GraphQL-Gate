import { parse, validate } from 'graphql';
import { GraphQLSchema } from 'graphql/type/schema';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import buildTypeWeightsFromSchema, { defaultTypeWeightsConfig } from '../analysis/buildTypeWeights';
import setupRateLimiter from './rateLimiterSetup';
import { ExpressMiddlewareConfig, ExpressMiddlewareSet } from '../@types/expressMiddleware';
import { connect } from '../utils/redis';
import ASTParser from '../analysis/ASTParser';

/**
 * Primary entry point for adding GraphQL Rate Limiting middleware to an Express Server
 * @param {GraphQLSchema} schema GraphQLSchema object
 * @param {ExpressMiddlewareConfig} middlewareConfig
 *      , "ratelimiter" must be explicitly specified in the setup of the middleware.
 *      , "redis" connection options (https://ioredis.readthedocs.io/en/stable/API/#new_Redis) and an optional "keyExpiry" property (defaults to 24h)
 *      , "typeWeights" optional type weight configuration for the GraphQL Schema. Developers can override default typeWeights. Defaults to {mutation: 10, query: 1, object: 1, scalar/enum: 0, connection: 2}
 *      , "dark: true" will run the package in "dark mode" to monitor queries and rate limiting data before implementing rate limitng functionality. Defaults to false
 *      , "enforceBoundedLists: true" will throw an error if any lists in the schema are not constrained by slicing arguments: Defaults to false
 *      , "depthLimit: number" will block queries with deeper nesting than the specified depth. Will not block queries by depth by default
 * @returns {RequestHandler} express middleware that computes the complexity of req.query and calls the next middleware
 * if the query is allowed or sends a 429 status if the request is blocked
 * @throws Error
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

    /** No query can have a depth of less than 2 */
    if (middlewareSetup.depthLimit <= 2) {
        throw new Error(
            `Error in expressGraphQLRateLimiter: depthLimit cannot be less than or equal to 1`
        );
    }

    /** Build the type weight object, create the redis client and instantiate the ratelimiter */
    const typeWeightObject = buildTypeWeightsFromSchema(
        schema,
        middlewareSetup.typeWeights,
        middlewareSetup.enforceBoundedLists
    );
    const redisClient = connect(middlewareSetup.redis.options);
    const rateLimiter = setupRateLimiter(
        middlewareSetup.rateLimiter,
        redisClient,
        middlewareSetup.redis.keyExpiry
    );

    /** Rate-limiting middleware */
    return async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void | Response<unknown, Record<string, unknown>>> => {
        const requestTimestamp = new Date().valueOf();
        // access the query and variables passed to the server in the body or query string
        let query;
        let variables;
        if (req.query) {
            query = req.query.query;
            variables = req.query.variables;
        } else if (req.body) {
            query = req.body.query;
            variables = req.body.variables;
        }
        if (!query) {
            // eslint-disable-next-line no-console
            console.error(
                '[graphql-gate] Error in expressGraphQLRateLimiter: There is no query on the request. Rate-Limiting skipped'
            );
            return next();
        }
        // check for a proxied ip address before using the ip address on request
        const ip: string = req.ips ? req.ips[0] : req.ip;

        const queryAST = parse(query);
        // validate the query against the schema. returns an array of errors.
        const validationErrors = validate(schema, queryAST);
        // return the errors to the client if the array has length. otherwise there are no errors
        if (validationErrors.length > 0) {
            res.status(400).json({ errors: validationErrors });
        }

        const queryParser = new ASTParser(typeWeightObject, variables);
        const queryComplexity = queryParser.processQuery(queryAST);

        try {
            const rateLimiterResponse = await rateLimiter.processRequest(
                ip,
                requestTimestamp,
                queryComplexity
            );
            res.locals.graphqlGate = {
                timestamp: requestTimestamp,
                complexity: queryComplexity,
                tokens: rateLimiterResponse.tokens,
                success:
                    rateLimiterResponse.success &&
                    queryParser.maxDepth >= middlewareSetup.depthLimit,
                depth: queryParser.maxDepth,
            };
            /** The three conditions for returning a status code 429 are
             * 1. rate-limiter blocked the request
             * 2. query exceeded the depth limit
             * 3. the middleware is configured not to run in dark mode
             */
            if (
                (!rateLimiterResponse.success ||
                    queryParser.maxDepth > middlewareSetup.depthLimit) &&
                !middlewareSetup.dark
            ) {
                // a Retry-After header of Infinity means the request will never be accepted
                return res
                    .status(429)
                    .set({
                        'Retry-After': `${
                            queryParser.maxDepth > middlewareSetup.depthLimit
                                ? Infinity
                                : rateLimiterResponse.retryAfter
                        }`,
                    })
                    .json(res.locals.graphqlgate);
            }
            return next();
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(
                `[graphql-gate] Error in expressGraphQLRateLimiter processing query. Rate limiting is skipped: ${err}`
            );
            return next(err);
        }
    };
}
