<div align="center">
<img width="50px" src="https://user-images.githubusercontent.com/89324687/182067950-54c00964-2be4-481a-976b-773d9112a4c0.png"/>
<h1>GraphQLGate</h1>
<a href="https://github.com/oslabs-beta/GraphQL-Gate"><img src="https://img.shields.io/badge/license-MIT-blue"/></a> <a href="https://github.com/oslabs-beta/GraphQL-Gate/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/oslabs-beta/GraphQL-Gate"></a> <a href="https://github.com/oslabs-beta/GraphQL-Gate/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/oslabs-beta/GraphQL-Gate"></a> <img alt="GitHub last commit" src="https://img.shields.io/github/last-commit/oslabs-beta/GraphQL-Gate">

   <h3 align="center"> <strong>A GraphQL rate-limiting library with query complextiy analysis for Node.js and Express</strong></h3>
   </div>

## Table of Contents

-   [Getting Started](#getting-started)
-   [Configuration](#configuration)
-   [How It Works](#how-it-works)
-   [Future Development](#future-development)
-   [Contributions](#contributions)
-   [Developers](#developers)
-   [License](#license)

## <a name="getting-started"></a> Getting Started

Install the package

```
npm i graphqlgate
```

Import the package and add the rate-limiting middlleware to the Express middleware chain before the GraphQL server.

NOTE: a Redis server instance will need to be started in order for the limiter to cache data.

```javascript
// import package
import expressGraphQLRateLimiter from 'graphQLGate';

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

    - `typeWeights: TypeWeightObject`

        - `mutation: number` | assigned weight to mutations | defaults to 10
        - `query: number` | assigned weight of a query | defaults to 1
        - `object: number` | assigned weight of GraphQL object, interface and union types | defaults to `1`
        - `scalar: number` | assigned weight of GraphQL scalar and enum types | defaults to `0`

    - `depthLimit: number` | throttle queies by the depth of the nested stucture | defaults to `Infinity` (ie. no limit)
    - `enforceBoundedLists: boolean` | if true, an error will be thrown if any lists types are not bound by slicing arguments [`first`, `last`, `limit`] or directives | defaults to `false`
    - `dark: boolean` | if true, the package will calculate complexity, depth and tokens but not throttle any queries. Use this to dark launch the package and monitor what would happen if rate limiting was added to yaur application

    All configuration options

    ```javascript
    expressGraphQLRateLimiter(schemaObject, {
        rateLimiter: {
            type: 'TOKEN_BUCKET', // rate-limiter selection
            refillRate: 10,
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

## <a name="how-it-works"></a> How It Works

how are things weighted examples

## <a name="future-development"></a> Future Development

-   configure rate-limiting cache with other caching libraries
-   resolve complexity analysis for queries
-   leaky bucket rate-limiting algorithm
-   experimint with performance improvments
    -   caching optimizations

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
