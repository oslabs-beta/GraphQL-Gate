import EventEmitter from 'events';
import { parse, validate } from 'graphql';
import { GraphQLSchema } from 'graphql/type/schema';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import buildTypeWeightsFromSchema, { defaultTypeWeightsConfig } from '../analysis/buildTypeWeights';
import setupRateLimiter from './rateLimiterSetup';
import { ExpressMiddlewareConfig, ExpressMiddlewareSet } from '../@types/expressMiddleware';
import { RateLimiterResponse } from '../@types/rateLimit';
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

    /**
     * We are using a queue and event emitter to handle situations where a user has two concurrent requests being processed.
     * The trailing request will be added to the queue to and await the prior request processing by the rate-limiter
     * This will maintain the consistency and accuracy of the cache when under load from one user
     */
    // stores request IDs for each user in an array to be processed
    const requestQueues: { [index: string]: string[] } = {};
    // Manages processing of requests queue
    const requestEvents = new EventEmitter();

    // processes requests (by resolving  promises) that have been throttled by throttledProcess
    async function processRequestResolver(
        userId: string,
        timestamp: number,
        tokens: number,
        resolve: (value: RateLimiterResponse | PromiseLike<RateLimiterResponse>) => void,
        reject: (reason: any) => void
    ) {
        try {
            const response = await rateLimiter.processRequest(userId, timestamp, tokens);
            requestQueues[userId] = requestQueues[userId].slice(1);
            resolve(response);
            // trigger the next event and delete the request queue for this user if there are no more requests to process
            requestEvents.emit(requestQueues[userId][0]);
            if (requestQueues[userId].length === 0) delete requestQueues[userId];
        } catch (err) {
            reject(err);
        }
    }

    /**
     * Throttle rateLimiter.processRequest based on user IP to prevent inaccurate redis reads
     * Throttling is based on a event driven promise fulfillment approach.
     * Each time a request is received a promise is added to the user's request queue. The promise "subscribes"
     * to the previous request in the user's queue then calls processRequest and resolves once the previous request
     * is complete.
     * @param userId
     * @param timestamp
     * @param tokens
     * @returns
     */
    async function throttledProcess(
        userId: string,
        timestamp: number,
        tokens: number
    ): Promise<RateLimiterResponse> {
        // Alternatively use crypto.randomUUID() to generate a random uuid
        const requestId = `${timestamp}${tokens}`;

        if (!requestQueues[userId]) {
            requestQueues[userId] = [];
        }
        requestQueues[userId].push(requestId);

        return new Promise((resolve, reject) => {
            if (requestQueues[userId].length > 1) {
                requestEvents.once(requestId, async () => {
                    await processRequestResolver(userId, timestamp, tokens, resolve, reject);
                });
            } else {
                processRequestResolver(userId, timestamp, tokens, resolve, reject);
            }
        });
    }

    /** Rate-limiting middleware */
    return async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void | Response<any, Record<string, any>>> => {
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
            console.error(
                'Error in expressGraphQLRateLimiter: There is no query on the request. Rate-Limiting skipped'
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
            const rateLimiterResponse = await throttledProcess(
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
            // log the error to the console and pass the request onto the next middleware.
            console.error(
                `Error in expressGraphQLRateLimiter processing query. Rate limiting is skipped: ${err}`
            );
            return next(err);
        }
    };
}
