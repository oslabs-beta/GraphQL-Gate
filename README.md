# GraphQLGate

<div align="center">

<a href="https://github.com/oslabs-beta/GraphQL-Gate"><img src="https://img.shields.io/badge/license-MIT-blue"/></a> <a href="https://github.com/oslabs-beta/GraphQL-Gate/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/oslabs-beta/GraphQL-Gate"></a> <a href="https://github.com/oslabs-beta/GraphQL-Gate/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/oslabs-beta/GraphQL-Gate"></a> <img alt="GitHub last commit" src="https://img.shields.io/github/last-commit/oslabs-beta/GraphQL-Gate">

   <p align="center"> <strong>A GraphQL rate-limiting library with query complextiy analysis for Node.js and Express</strong></p>
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
npm i grapghqlgate
```

Import the package and add the rate-limiting middlere to the middlechain before the GraphQL server

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
                port: 6379, // ioredis connection options
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

1. ### `schema: GraphQLSchema` | required

2. ### `configObject: ExpressMiddlewareConfig` | required

-   `rateLimiter: <object>` | required

    -   Buckets

        -   `type: 'TOKEN_BUCKET'`
        -   `refillRate: number`
        -   `capacity: number`

    -   Windows

        -   `type: 'FIXED_WINDOW' | SLIDING_WINDOW_LOG | SLIDING_WINDOW_COUTER`
        -   `windowSize: number` (in ms)
        -   `capacity: number`

-   `redis: <object>`

    -   `options: RedisOptions` | [ioredis configuration options](https://github.com/luin/ioredis) | defaults to standard ioredis connection options
    -   `keyExpiry: number` (ms) | custom expiry of keys in redis cache | defaults to 24 hours

-   `typeWeights: <object>`

typeWeights?: TypeWeightConfig; dark?: boolean; enforceBoundedLists?: boolean; depthLimit?: number;

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
