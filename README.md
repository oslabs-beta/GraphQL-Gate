<div align="center">
   <img width="50px" src="https://user-images.githubusercontent.com/89324687/182067950-54c00964-2be4-481a-976b-773d9112a4c0.png"/>
   <h1>GraphQLGate</h1>
   <a href="https://github.com/oslabs-beta/GraphQL-Gate"><img src="https://img.shields.io/badge/license-MIT-blue"/></a> <a href="https://github.com/oslabs-    beta/GraphQL-Gate/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/oslabs-beta/GraphQL-Gate"></a> <a             href="https://github.com/oslabs-beta/GraphQL-Gate/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/oslabs-beta/GraphQL-Gate"></a> <img alt="GitHub last commit" src="https://img.shields.io/github/last-commit/oslabs-beta/GraphQL-Gate">

   <h3 align="center"> <strong>A GraphQL rate-limiting library with query complextiy analysis for Node.js and Express</strong></h3>
   </div>
   
&nbsp;
## Summary

Developed under tech-accelerator [OSLabs](https://opensourcelabs.io/), GraphQLGate strives for a principled approach to complexity analysis and rate-limiting for GraphQL queries by accurately estimating an upper-bound of the response size of the query. Within a loosely opinionated framework with lots of configuration options, you can reliably throttle GraphQL queries by complexity and depth to protect your GraphQL API. Our solution is inspired by [this paper](https://github.com/Alan-Cha/fse20/blob/master/submissions/functional/FSE-24/graphql-paper.pdf) from IBM research teams.

## Table of Contents

-   [Getting Started](#getting-started)
-   [Configuration](#configuration)
-   [Notes on Lists](#lists)
-   [How It Works](#how-it-works)
-   [Response](#response)
-   [Error Handling](#error-handling)
-   [Internals](#internals)
-   [Future Development](#future-development)
-   [Contributions](#contributions)
-   [Developers](#developers)
-   [License](#license)

## <a name="getting-started"></a> Getting Started

Install the package

```
npm i graphql-limiter
```

Import the package and add the rate-limiting middleware to the Express middleware chain before the GraphQL server.

NOTE: a Redis server instance will need to be started in order for the limiter to cache data.

```javascript
// import package
import { expressGraphQLRateLimiter } from 'graphql-limiter';

/**
 * Import other dependencies
 * */

//Add the middleware into your GraphQL middleware chain
app.use(
    'gql',
    expressGraphQLRateLimiter(schemaObject, {
        rateLimiter: {
            type: 'TOKEN_BUCKET',
            refillRate: 10,
            capacity: 100,
        },
    }) /** add GraphQL server here */
);
```

## <a name="configuration"></a> Configuration

1. #### `schema: GraphQLSchema` | required

2. #### `config: ExpressMiddlewareConfig` | required

    - `rateLimiter: RateLimiterOptions` | required

        - `type: 'TOKEN_BUCKET' | 'FIXED_WINDOW' | 'SLIDING_WINDOW_LOG' | 'SLIDING_WINDOW_COUTER'`
        - `capacity: number`
        - `refillRate: number` | bucket algorithms only
        - `windowSize: number` | (in ms) window algorithms only

    - `redis: RedisConfig`

        - `options: RedisOptions` | [ioredis configuration options](https://github.com/luin/ioredis) | defaults to standard ioredis connection options (`localhost:6379`)
        - `keyExpiry: number` (ms) | custom expiry of keys in redis cache | defaults to 24 hours

    - <a name="typeWeights"></a>`typeWeights: TypeWeightObject`

        - `mutation: number` | assigned weight to mutations | defaults to 10
        - `query: number` | assigned weight of a query | defaults to 1
        - `object: number` | assigned weight of GraphQL object, interface and union types | defaults to `1`
        - `scalar: number` | assigned weight of GraphQL scalar and enum types | defaults to `0`

    - `depthLimit: number` | throttle queies by the depth of the nested stucture | defaults to `Infinity` (ie. no limit)
    - `enforceBoundedLists: boolean` | if true, an error will be thrown if any lists types are not bound by slicing arguments [`first`, `last`, `limit`] or directives | defaults to `false`
    - `dark: boolean` | if true, the package will calculate complexity, depth and tokens but not throttle any queries. Use this to dark launch the package and monitor the rate limiter's impact without limiting user requests.

    All configuration options

    ```javascript
    expressGraphQLRateLimiter(schemaObject, {
        rateLimiter: {
            type: 'SLIDING_WINDOW_LOG', // rate-limiter selection
            windowSize: 6000, // 6 seconds
            capacity: 100,
        },
        redis: {
            keyExpiry: 14400000 // 4 hours, defaults to 86400000 (24 hours)
            options: {
                host: 'localhost' // ioredis connection options
                port: 6379,
            }
        },
        typeWeights: { // weights of GraphQL types
            mutation: 10,
            query: 1,
            object: 1,
            scalar: 0,
        },
        enforceBoundedLists: false, // defaults to false
        dark: false, // defaults to false
        depthLimit: 7 // defaults to Infinity (ie. no depth limiting)
    });
    ```

## <a name="lists"></a> Notes on Lists

For queries that return a list, the complexity can be determined by providing a slicing argument to the query (`first`, `last`, `limit`), or using a schema directive.

1. Slicing arguments: lists must be bounded by one integer slicing argument in order to calculate the complexity for the field. This package supports the slicing arguments `first`, `last` and `limit`. The complexity of the list will be the value passed as the argument to the field.

2. Directives: To use directives, `@listCost` must be defined in your schema with `directive @listCost(cost: Int!) on FIELD_DEFINITION`. Then, on any field which resolves to an unbounded list, add `@listCost(cost: [Int])` where `[Int]` is the complexity for this field.

(Note: Slicing arguments are preferred and will override the the `@listCost` directive! `@listCost` is in place as a fall back.)

```graphql
directive @listCost(cost: Int!) on FIELD_DEFINITION
type Human {
    id: ID!
}
type Query {
    humans: [Human] @listCost(cost: 10)
}
```

## <a name="how-it-works"></a> How It Works

Requests are rate-limited based on the IP address associated with the request.

On startup, the GraphQL (GQL) schema is parsed to build an object that maps GQL types/fields to their corresponding weights. Type weights can be provided during <a href="#typeWeights">initial configuration</a>. When a request is received, this object is used to cross reference the fields queried by the user and compute the complexity of each field. The total complexity of the request is the sum of these values.

Complexity is determined, statically (before any resolvers are called) to estimate the upper bound of the response size - a proxy for the work done by the server to build the response. The total complexity is then used to allow/block the request based on popular rate-limiting algorithms.

Requests for each user are processed sequentially by the rate limiter.

Example (with default weights):

```graphql
query {
    # 1 query
    hero(episode: EMPIRE) {
        # 1 object
        name # 0 scalar
        id # 0 scalar
        friends(first: 3) {
            # 3 objects
            name # 0 scalar
            id # 0 scalar
        }
    }
    reviews(episode: EMPIRE, limit: 5) {
        #   5 objects
        stars # 0 scalar
        commentary # 0 scalar
    }
} # total complexity of 10
```

## <a name="response"></a> Response

1. <b>Blocked Requests</b>: blocked requests recieve a response with,

    - status of `429` for `Too Many Requests`
    - `Retry-After` header indicating the time to wait in seconds before the request could be approved (`Infinity` if the complexity is greater than rate-limiting capacity).
    - A JSON response with the remaining `tokens` available, `complexity` of the query, `depth` of the query, `success` of the query set to `false`, and the UNIX `timestamp` of the request

2. <b>Successful Requests</b>: successful requests are passed on to the next function in the middleware chain with the following properties saved to `res.locals`

```javascript
{
   graphqlGate: {
      success: boolean, // true when successful
      tokens: number, // tokens available after request
      compexity: number, // complexity of the query
      depth: number, // depth of the query
      timestamp: number, // UNIX timestamp
   }
}
```

## <a name="error-handling"></a> Error Handling

-   Incoming queries are validated against the GraphQL schema. If the query is invalid, a response with status code `400` is returned along with an array of GraphQL Errors that were found.
-   To avoid disrupting server activity, errors thrown during the analysis and rate-limiting of the query are logged and the request is passed onto the next piece of middleware in the chain.

## <a name="internals"></a> Internals

This package exposes 3 additional functionalities which comprise the internals of the package. This is a breif documentaion on them.

### Complexity Analysis

1. #### `typeWeightsFromSchema` | function to create the type weight object from the schema for complexity analysis

    - `schema: GraphQLSchema` | GraphQL schema object
    - `typeWeightsConfig: TypeWeightConfig = defaultTypeWeightsConfig` | type weight configuration
    - `enforceBoundedLists = false`
    - returns: `TypeWeightObject`
    - usage:

        ```ts
        import { typeWeightsFromSchema } from 'graphql-limiter';
        import { GraphQLSchema } from 'graphql/type/schema';
        import { buildSchema } from 'graphql';

        let schema: GraphQLSchema = buildSchema(`...`);

        const typeWeights: TypeWeightObject = typeWeightsFromSchema(schema);
        ```

2. #### `QueryParser` | class to calculate the complexity of the query based on the type weights and variables

    - `typeWeights: TypeWeightObject`
    - `variables: Variables` | variables on request
    - returns a class with method:

        - `processQuery(queryAST: DocumentNode): number`
        - returns: complexity of the query and exposes `maxDepth` property for depth limiting

            ```ts
            import { typeWeightsFromSchema } from 'graphql-limiter';
            import { parse, validate } from 'graphql';

            let queryAST: DocumentNode = parse(`...`);

            const queryParser: QueryParser = new QueryParser(typeWeights, variables);

            // query must be validatied against the schema before processing the query
            const validationErrors = validate(schema, queryAST);

            const complexity: number = queryParser.processQuery(queryAST);
            ```

### Rate-limiting

3. #### `rateLimiter` | returns a rate limiting class instance based on selections

    - `rateLimiter: RateLimiterConfig` | see "configuration" -> rateLimiter
    - `client: Redis` | an ioredis client
    - `keyExpiry: number` | time (ms) for key to persist in cache
    - returns a rate limiter class with method:

        - `processRequest(uuid: string, timestamp: number, tokens = 1): Promise<RateLimiterResponse>`
        - returns: `{ success: boolean, tokens: number, retryAfter?: number }` | where `tokens` is tokens available, `retryAfter` is time to wait in seconds before the request would be successful and `success` is false if the request is blocked

        ```ts
        import { rateLimiter } from 'graphql-limiter';

        const limiter: RateLimiter = rateLimiter(
            {
                type: 'TOKEN_BUCKET',
                refillRate: 1,
                capacity: 10,
            },
            redisClient,
            86400000 // 24 hours
        );

        const response: RateLimiterResponse = limiter.processRequest(
            'user-1',
            new Date().valueOf(),
            5
        );
        ```

## <a name="future-development"></a> Future Development

-   Ability to use this package with other caching technologies or libraries
-   Implement "resolve complexity analysis" for queries
-   Implement leaky bucket algorithm for rate-limiting
-   Experiment with performance improvements
    -   caching optimization
-   Ensure connection pagination conventions can be accuratly acconuted for in complexity analysis
-   Ability to use middleware with other server frameworks

## <a name="contributions"></a> Contributions

Contributions to the code, examples, documentation, etc. are very much appreciated.

-   Please report issues and bugs directly in this [GitHub project](https://github.com/oslabs-beta/GraphQL-Gate/issues).

## <a name="developers"></a> Developers

-   [Evan McNeely](https://github.com/evanmcneely)
-   [Stephan Halarewicz](https://github.com/shalarewicz)
-   [Flora Yufei Wu](https://github.com/feiw101)
-   [Jon Dewey](https://github.com/donjewey)
-   [Milos Popovic](https://github.com/milos381)

## <a name="license"></a> License

This product is licensed under the MIT License - see the LICENSE.md file for details.

This is an open source product.

This product is accelerated by OS Labs.
