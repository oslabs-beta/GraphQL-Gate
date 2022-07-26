import { parse, validate } from 'graphql';
import { RedisOptions } from 'ioredis';
import { GraphQLSchema } from 'graphql/type/schema';
import { Request, Response, NextFunction, RequestHandler } from 'express';

import buildTypeWeightsFromSchema, { defaultTypeWeightsConfig } from '../analysis/buildTypeWeights';
import setupRateLimiter from './rateLimiterSetup';
import getQueryTypeComplexity from '../analysis/typeComplexityAnalysis';
import { RateLimiterOptions, RateLimiterSelection, RateLimiterResponse } from '../@types/rateLimit';
import { TypeWeightConfig } from '../@types/buildTypeWeights';
import { connect } from '../utils/redis';

// FIXME: Will the developer be responsible for first parsing the schema from a file?
// Can consider accepting a string representing a the filepath to a schema
// FIXME: Should a 429 status be sent by default or do we allow the user to handle blocked requests?

/**
 * Primary entry point for adding GraphQL Rate Limiting middleware to an Express Server
 * @param {RateLimiterSelection} rateLimiter Specify rate limiting algorithm to be used
 * @param {RateLimiterOptions} options Specify the appropriate options for the selected rateLimiter
 * @param {GraphQLSchema} schema GraphQLSchema object
 * @param {RedisClientOptions} RedisOptions ioredis connection options https://ioredis.readthedocs.io/en/stable/API/#new_Redis
 * @param {TypeWeightConfig} typeWeightConfig Optional type weight configuration for the GraphQL Schema.
 * Defaults to {mutation: 10, object: 1, field: 0, connection: 2}
 * @returns {RequestHandler} express middleware that computes the complexity of req.query and calls the next middleware
 * if the query is allowed or sends a 429 status if the request is blocked
 * FIXME: How about the specific GraphQLError?
 * @throws ValidationError if GraphQL Schema is invalid.
 */
export function expressRateLimiter(
    rateLimiterAlgo: RateLimiterSelection,
    rateLimiterOptions: RateLimiterOptions,
    schema: GraphQLSchema,
    redisClientOptions: RedisOptions,
    typeWeightConfig: TypeWeightConfig = defaultTypeWeightsConfig
): RequestHandler {
    /**
     * build the type weight object, create the redis client and instantiate the ratelimiter
     * before returning the express middleware that calculates query complexity and throttles the requests
     */
    // TODO: Throw ValidationError if schema is invalid
    const typeWeightObject = buildTypeWeightsFromSchema(schema, typeWeightConfig);
    // TODO: Throw error if connection is unsuccessful
    // Default connection timeout is 10000 ms of inactivity
    // FIXME: Do we need to re-establish connection?
    const redisClient = connect(redisClientOptions); // Default port is 6379 automatically
    const rateLimiter = setupRateLimiter(rateLimiterAlgo, rateLimiterOptions, redisClient);

    // stores request IDs to be processed
    const requestQueue: { [index: string]: string[] } = {};

    // Throttle rateLimiter.processRequest based on user IP to prent inaccurate redis reads
    async function throttledProcess(
        userId: string,
        timestamp: number,
        tokens: number
    ): Promise<RateLimiterResponse> {
        // Generate a random uuid for this request and add it to the queue
        // Alternatively use crypto.randomUUID() to generate a uuid
        const requestId = `${userId}${timestamp}${tokens}`;

        if (!requestQueue[userId]) {
            requestQueue[userId] = [];
        }
        requestQueue[userId].push(requestId);

        // Start a loop to check when this request should be processed
        return new Promise((resolve, reject) => {
            const intervalId = setInterval(async () => {
                console.log('in set timeout');
                if (requestQueue[userId][0] === requestId) {
                    // process the request
                    clearInterval(intervalId);
                    const response = await rateLimiter.processRequest(userId, timestamp, tokens);
                    // requestQueue[userId].shift();
                    requestQueue[userId] = requestQueue[userId].slice(1);
                    resolve(response);
                } else {
                    console.log('not our turn');
                }
            }, 100);
        });
    }

    // Sort the requests by timestamps to make sure we process in the correct order
    // We need to store the request, response and next object so that the correct one is used
    // the function we return accepts the unique request, response, next objects
    // it will store these and then process them in the order in which they were received.
    // We can do an event listener that waits for the previous request in the queue to be finished
    // store the middleware in closure

    // Catch the request
    // add this to the queue
    // proccess the oldest request in the queue
    // check if the queue is empty => if not process the next request
    // otherwise return
    // process restarts when the next request comes in

    // so r1, r2 come in
    // r1, and r2 get processed with thin same frame on call stack
    // r2 call is done once r2 is added to the queue

    // return a throttled middleware. Check every 100ms? make this a setting?
    // how do we make sure these get queued properly?
    // store the requests in an array when available grab the next request for a user
    /**
     * Request 1 comes in
     *  Start handling request 1
     *  In the meantime reqeust 2 comes in for the same suer
     *  Finish handling request 1
     *    check the queue for this user
     *    if it's empty we're done
     *    it it has a request handle the next one
     *
     * Not throttling on time just queueing requests.
     */

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
        /**
         * There are numerous ways to get the ip address off of the request object.
         * - the header 'x-forward-for' will hold the originating ip address if a proxy is placed infront of the server. This would be commen for a production build.
         * - req.ips wwill hold an array of ip addresses in'x-forward-for' header. client is likely at index zero
         * - req.ip will have the ip address
         * - req.socket.remoteAddress is an insatnce of net.socket which is used as another method of getting the ip address
         *
         * req.ip and req.ips will worx in express but not with other frameworks
         */
        // check for a proxied ip address before using the ip address on request
        const ip: string = req.ips ? req.ips[0] : req.ip;

        // FIXME: this will only work with type complexity
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
            const rateLimiterResponse = await throttledProcess(
                ip,
                requestTimestamp,
                queryComplexity
            );
            if (!rateLimiterResponse.success) {
                // TODO: add a header 'Retry-After' with the time to wait untill next query will succeed
                // FIXME: send information about query complexity, tokens, etc, to the client on rejected query
                return res.status(429).json({ graphqlGate: rateLimiterResponse });
            }
            res.locals.graphqlGate = {
                timestamp: requestTimestamp,
                complexity: queryComplexity,
                tokens: rateLimiterResponse.tokens,
            };
            return next();
        } catch (err) {
            return next(err);
        }
    };
}

export default expressRateLimiter;
