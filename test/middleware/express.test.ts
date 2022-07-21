import { Request, Response, NextFunction, RequestHandler } from 'express';
import { GraphQLSchema, buildSchema } from 'graphql';
import * as ioredis from 'ioredis';
import expressGraphQLRateLimiter from '../../src/middleware/index';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RedisMock = require('ioredis-mock');

let middleware: RequestHandler;
let mockRequest: Partial<Request>;
let complexRequest: Partial<Request>;
let mockResponse: Partial<Response>;
let nextFunction: NextFunction = jest.fn();
const schema: GraphQLSchema = buildSchema(`
                type Query {
                    hero(episode: Episode): Character
                    reviews(episode: Episode!, first: Int): [Review]
                  
                    character(id: ID!): Character
                    droid(id: ID!): Droid
                    human(id: ID!): Human
                    scalars: Scalars
                }    
                enum Episode {
                    NEWHOPE
                    EMPIRE
                    JEDI
                }
                interface Character {
                    id: ID!
                    name: String!
                    friends: [Character]
                    appearsIn: [Episode]!
                }
                type Human implements Character {
                    id: ID!
                    name: String!
                    homePlanet: String
                    friends: [Character]
                    appearsIn: [Episode]!
                }
                type Droid implements Character {
                    id: ID!
                    name: String!
                    friends: [Character]
                    primaryFunction: String
                    appearsIn: [Episode]!
                }
                type Review {
                    episode: Episode
                    stars: Int!
                    commentary: String
                }
           
                type Scalars {
                    num: Int,
                    id: ID,
                    float: Float,
                    bool: Boolean,
                    string: String
                    test: Test,
                }
                type Test {
                    name: String,
                    variable: Scalars
                }
            `);

describe('Express Middleware tests', () => {
    let redis: ioredis.Redis;
    beforeEach(() => {
        redis = new RedisMock();
    });
    test('middleware can be setup with minum required configuration without error', () => {
        expect(
            expressGraphQLRateLimiter(schema, {
                rateLimiter: {
                    type: 'TOKEN_BUCKET',
                    options: { refillRate: 1, bucketSize: 10 },
                },
            })
        ).not.toThrowError();
    });

    describe('Middleware is configurable...', () => {
        xdescribe('...successfully connects to redis using standard connection options', () => {
            // let redis: ioredis.Redis;
            beforeEach(() => {
                redis = new RedisMock();
            });

            xtest('...via url', () => {
                // TODO: Connect to redis instance and add 'connect' event listener
                // assert that event listener is called once
                expect.assertions(1);
                redis.on('connect', () => {
                    expect(true);
                });
                expressGraphQLRateLimiter(schema, {
                    rateLimiter: {
                        type: 'TOKEN_BUCKET',
                        options: { refillRate: 1, bucketSize: 10 },
                    },
                    redis: { options: { host: '//localhost:6379' } },
                });
            });

            xtest('via socket', () => {
                // TODO: Connect to redis instance and add 'connect' event listener
                // assert that event listener is called once
                expect(true).toBeFalsy();
            });

            xtest('defaults to localhost', () => {
                // TODO: Connect to redis instance and add 'connect' event listener
                // assert that event listener is called once
                expect(true).toBeFalsy();
            });
        });

        describe('...Can be configured to use a valid algorithm', () => {
            test('... Token Bucket', () => {
                // FIXME: Is it possible to check which algorithm was chosen beyond error checking?
                expect(
                    expressGraphQLRateLimiter(schema, {
                        rateLimiter: {
                            type: 'TOKEN_BUCKET',
                            options: { refillRate: 1, bucketSize: 10 },
                        },
                    })
                ).not.toThrow();
            });

            xtest('...Leaky Bucket', () => {
                expect(
                    expressGraphQLRateLimiter(schema, {
                        rateLimiter: {
                            type: 'LEAKY_BUCKET',
                            options: { refillRate: 1, bucketSize: 10 }, // FIXME: Replace with valid params
                        },
                    })
                ).not.toThrow();
            });

            xtest('...Fixed Window', () => {
                expect(
                    expressGraphQLRateLimiter(schema, {
                        rateLimiter: {
                            type: 'FIXED_WINDOW',
                            options: { refillRate: 1, bucketSize: 10 }, // FIXME: Replace with valid params
                        },
                    })
                ).not.toThrow();
            });

            xtest('...Sliding Window', () => {
                expect(
                    expressGraphQLRateLimiter(schema, {
                        rateLimiter: {
                            type: 'SLIDING_WINDOW_LOG',
                            options: { refillRate: 1, bucketSize: 10 }, // FIXME: Replace with valid params
                        },
                    })
                ).not.toThrow();
            });

            xtest('...Sliding Window Counter', () => {
                expect(
                    expressGraphQLRateLimiter(schema, {
                        rateLimiter: {
                            type: 'SLIDING_WINDOW_LOG',
                            options: { refillRate: 1, bucketSize: 10 }, // FIXME: Replace with valid params
                        },
                    })
                ).not.toThrow();
            });
        });

        xdescribe('... throws an error', () => {
            test('... for invalid schemas', () => {
                const invalidSchema: GraphQLSchema = buildSchema(`{Query {name}`);

                expect(
                    expressGraphQLRateLimiter(invalidSchema, {
                        rateLimiter: {
                            type: 'TOKEN_BUCKET',
                            options: { refillRate: 1, bucketSize: 10 },
                        },
                    })
                ).toThrowError('ValidationError');
            });

            test('... if unable to connect to redis', () => {
                expect(
                    expressGraphQLRateLimiter(schema, {
                        rateLimiter: {
                            type: 'TOKEN_BUCKET',
                            options: { bucketSize: 10, refillRate: 1 },
                        },

                        redis: { options: { host: 'localhost', port: 1 } },
                    })
                ).toThrow('ECONNREFUSED');
            });
        });

        xdescribe('...other configuration parameters', () => {
            // dark
            // enforceBourdedLists
            // depthLimit
            // keyExpiry
        });
    });

    describe('Middleware is Functional', () => {
        // Before each test configure a new middleware amd mock req, res objects.
        beforeAll(() => {
            jest.useFakeTimers('modern');
        });

        afterAll(() => {
            jest.useRealTimers();
            jest.clearAllTimers();
            jest.clearAllMocks();
        });

        beforeEach(() => {
            middleware = expressGraphQLRateLimiter(schema, {
                rateLimiter: {
                    type: 'TOKEN_BUCKET',
                    options: { bucketSize: 10, refillRate: 1 },
                },
            });
            mockRequest = {
                query: {
                    // complexity should be 2 (1 Query + 1 Scalar)
                    query: `Query {
                    scalars: {
                        num
                    }
                `,
                },
                ip: '123.456',
            };

            mockResponse = {
                json: jest.fn(),
                send: jest.fn(),
                sendStatus: jest.fn(),
                locals: {},
            };

            complexRequest = {
                // complexity should be 10 if 'first' is accounted for.
                // Query: 1, droid: 1, reviews 8: 1)
                query: {
                    query: `Query {
                        droid(id: 1) {
                            name
                        }
                        reviews(episode: 'NEWHOPE', first: 8) {
                            episode 
                            stars
                            commentary
                        }
                `,
                },
            };
            nextFunction = jest.fn();
        });

        describe('Adds expected properties to res.locals', () => {
            test('adds UNIX timestamp', () => {
                middleware(mockRequest as Request, mockResponse as Response, nextFunction);

                expect(mockResponse.locals).toHaveProperty('timestamp');
                expect(mockResponse.locals?.timestamp).toBeInstanceOf('number');
                // confirm that this is timestamp +/- 5 minutes of now.
                const now: number = Date.now().valueOf();
                const diff: number = Math.abs(now - (mockResponse.locals?.timestamp || 0));
                expect(diff).toBeLessThan(5 * 60);
            });

            test('adds complexity', () => {
                middleware(mockRequest as Request, mockResponse as Response, nextFunction);

                expect(mockResponse.locals).toHaveProperty('complexity');
                expect(mockResponse.locals?.complexity).toBeInstanceOf('number');
                expect(mockResponse.locals?.complexity).toBeGreaterThanOrEqual(0);
            });

            test('adds tokens', () => {
                middleware(mockRequest as Request, mockResponse as Response, nextFunction);

                expect(mockResponse.locals).toHaveProperty('tokens');
                expect(mockResponse.locals?.complexity).toBeInstanceOf('number');
                expect(mockResponse.locals?.complexity).toBeGreaterThanOrEqual(0);
            });

            test('adds success', () => {
                middleware(mockRequest as Request, mockResponse as Response, nextFunction);

                expect(mockResponse.locals).toHaveProperty('success');
                expect(mockResponse.locals?.complexity).toBeInstanceOf('boolean');
            });

            xtest('adds depth', () => {
                middleware(mockRequest as Request, mockResponse as Response, nextFunction);

                expect(mockResponse.locals).toHaveProperty('depth');
                expect(mockResponse.locals?.complexity).toBeInstanceOf('number');
                expect(mockResponse.locals?.complexity).toBeGreaterThanOrEqual(0);
            });
        });

        describe('Correctly limits requests', () => {
            describe('Allows requests', () => {
                test('...a single request', () => {
                    // successful request calls next without any arguments.
                    middleware(mockRequest as Request, mockResponse as Response, nextFunction);
                    expect(nextFunction).toBeCalledTimes(1);
                    expect(nextFunction).toBeCalledWith();
                });

                test('Multiple valid requests at > 1 second intervals', () => {
                    for (let i = 0; i < 3; i++) {
                        const next: NextFunction = jest.fn();
                        middleware(complexRequest as Request, mockResponse as Response, next);
                        expect(next).toBeCalledTimes(1);
                        expect(next).toBeCalledWith();

                        // advance the timers by 1 second for the next request
                        jest.advanceTimersByTime(1000);
                    }
                });

                test('Multiple valid requests at within one second', () => {
                    for (let i = 0; i < 3; i++) {
                        const next: NextFunction = jest.fn();
                        middleware(complexRequest as Request, mockResponse as Response, next);
                        expect(next).toBeCalledTimes(1);
                        expect(next).toBeCalledWith();

                        // advance the timers by 1 second for the next request
                        jest.advanceTimersByTime(20);
                    }
                });
            });

            describe('BLOCKS requests', () => {
                test('A single request that exceeds capacity', () => {
                    const blockedRequest: Partial<Request> = {
                        // complexity should be 12 if 'first' is accounted for.
                        // scalars: 1, droid: 1, reviews (10 * (1 Review, 0 episode))
                        query: {
                            query: `Query {
                            scalars: {
                                num
                            }
                            droid(id: 1) {
                                name
                            }
                            reviews(episode: 'NEWHOPE', first: 10) {
                                episode 
                                stars
                                commentary
                            }
                        `,
                        },
                    };

                    middleware(blockedRequest as Request, mockResponse as Response, nextFunction);
                    expect(mockResponse.statusCode).toBe(429);
                    expect(nextFunction).not.toBeCalled();

                    // FIXME: There are multiple functions to send a response
                    // json, send html, sendStatus etc. How do we check at least one was called
                    expect(mockResponse.send).toBeCalled();
                });

                test('Multiple queries that exceed token limit', () => {
                    for (let i = 0; i < 5; i++) {
                        // Send 5 queries of complexity 2. These should all succeed
                        middleware(mockRequest as Request, mockResponse as Response, nextFunction);

                        // advance the timers by 20 miliseconds for the next request
                        jest.advanceTimersByTime(20);
                    }

                    // Send a 6th request that should be blocked.
                    const next: NextFunction = jest.fn();
                    middleware(mockRequest as Request, mockResponse as Response, next);
                    expect(mockResponse.statusCode).toBe(429);
                    expect(next).not.toBeCalled();

                    // FIXME: See above comment on sending responses
                    expect(mockResponse.send).toBeCalled();
                });

                xtest('Retry-After header is on blocked response', () => {});
            });
        });

        xtest('Uses User IP Address in Redis', async () => {
            // FIXME: In order to test this accurately the middleware would need to connect
            // to a mock instance or the tests would need to connect to an actual redis instance
            // We could use NODE_ENV varibale in the implementation to determine the connection type.

            // TODO: connect to the actual redis client here. Make sure to disconnect for proper teardown
            const client: ioredis.Redis = new RedisMock();
            await client.connect();
            // Check for change in the redis store for the IP key

            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore mockRequest will always have an ip address.
            const initialValue: string | null = await client.get(mockRequest.ip);

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);

            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const finalValue: string | null = await client.get(mockRequest.ip);

            expect(finalValue).not.toBeNull();
            expect(finalValue).not.toBe(initialValue);
        });

        xdescribe('handles error correctly', () => {
            // validation errors
            // redis connection errors in token bucket
            // complexity anaylsis errors
        });
    });
});
