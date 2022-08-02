import 'ts-jest';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { GraphQLSchema, buildSchema } from 'graphql';
import * as ioredis from 'ioredis';
import expressGraphQLRateLimiter from '../../src/middleware/index';

import * as redis from '../../src/utils/redis';

const mockConnect = jest.spyOn(redis, 'connect');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RedisMock = require('ioredis-mock');

let middleware: RequestHandler;
let mockRequest: Partial<Request>;
let complexRequest: Partial<Request>;
let mockResponse: Partial<Response>;
let nextFunction: NextFunction = jest.fn();
const schema: GraphQLSchema = buildSchema(`
                directive @listCost(cost: Int!) on FIELD_DEFINITION         
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
                    friends: [Character] @listCost(cost: 10)
                    appearsIn: [Episode]!
                }
                type Human implements Character {
                    id: ID!
                    name: String!
                    homePlanet: String
                    friends: [Character] @listCost(cost: 10)
                    appearsIn: [Episode]!
                }
                type Droid implements Character {
                    id: ID!
                    name: String!
                    friends: [Character] @listCost(cost: 10)
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
    afterEach(() => {
        redis.shutdown();
    });
    describe('Middleware is configurable...', () => {
        xdescribe('...successfully connects to redis using standard connection options', () => {
            let mockRedis;
            beforeEach(() => {
                mockRedis = new RedisMock();
            });

            xtest('...via url', () => {
                // TODO: Connect to redis instance and add 'connect' event listener
                // assert that event listener is called once
                expect(true).toBeFalsy();

                // expect.assertions(1);
                // redis.on('connect', () => {
                //     expect(true);
                // });
                // expressGraphQLRateLimiter(schema, {
                //     rateLimiter: {
                //         type: 'TOKEN_BUCKET',
                //         options: { refillRate: 1, bucketSize: 10 },
                //     },
                //     redis: { options: { host: '//localhost:6379' } },
                // });
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
                expect(() =>
                    expressGraphQLRateLimiter(schema, {
                        rateLimiter: {
                            type: 'TOKEN_BUCKET',
                            refillRate: 1,
                            capacity: 10,
                        },
                    })
                ).not.toThrow();
            });

            xtest('...Leaky Bucket', () => {
                expect(() =>
                    expressGraphQLRateLimiter(schema, {
                        rateLimiter: {
                            type: 'LEAKY_BUCKET',
                            refillRate: 1,
                            capacity: 10, // FIXME: Replace with valid params
                        },
                    })
                ).not.toThrow();
            });

            test('...Fixed Window', () => {
                expect(() =>
                    expressGraphQLRateLimiter(schema, {
                        rateLimiter: {
                            type: 'FIXED_WINDOW',
                            capacity: 1,
                            windowSize: 1000,
                        },
                    })
                ).not.toThrow();
            });

            test('...Sliding Window Log', () => {
                expect(() =>
                    expressGraphQLRateLimiter(schema, {
                        rateLimiter: {
                            type: 'SLIDING_WINDOW_LOG',
                            windowSize: 1000,
                            capacity: 10,
                        },
                    })
                ).not.toThrow();
            });

            test('...Sliding Window Counter', () => {
                expect(() =>
                    expressGraphQLRateLimiter(schema, {
                        rateLimiter: {
                            type: 'SLIDING_WINDOW_LOG',
                            windowSize: 1,
                            capacity: 10,
                        },
                    })
                ).not.toThrow();
            });
        });

        xdescribe('... throws an error', () => {
            test('... for invalid schemas', () => {
                const invalidSchema: GraphQLSchema = buildSchema(`{Query {name}`);

                expect(() =>
                    expressGraphQLRateLimiter(invalidSchema, {
                        rateLimiter: {
                            type: 'TOKEN_BUCKET',
                            refillRate: 1,
                            capacity: 10,
                        },
                    })
                ).toThrow('GraphQLError');
            });

            xtest('... if unable to connect to redis', () => {
                expect(async () =>
                    expressGraphQLRateLimiter(schema, {
                        rateLimiter: {
                            type: 'TOKEN_BUCKET',
                            refillRate: 1,
                            capacity: 10,
                        },

                        redis: { options: { host: 'localhost', port: 1 } },
                    })
                ).toThrow('ECONNREFUSED');
            });
        });

        describe('...other configuration parameters', () => {
            beforeAll(() => mockConnect.mockImplementation(() => new RedisMock()));
            beforeEach(() => {
                mockRequest = {
                    body: {
                        // complexity should be 2 (1 Query + 1 Scalar)
                        query: `query {
                            droid(id: 1) {
                                name
                            }
                            reviews(episode: NEWHOPE, first: 8) {
                                episode
                                stars
                                commentary
                            }
                        } `,
                    },
                    ip: '111',
                };

                mockResponse = {
                    json: jest.fn(),
                    send: jest.fn(),
                    set: jest.fn().mockReturnThis(),
                    sendStatus: jest.fn(),
                    status: jest.fn().mockReturnThis(),
                    locals: {},
                };
                nextFunction = jest.fn();
            });

            test('can be configured to run in dark mode', async () => {
                middleware = expressGraphQLRateLimiter(schema, {
                    rateLimiter: {
                        type: 'TOKEN_BUCKET',
                        refillRate: 1,
                        capacity: 2,
                    },
                    dark: true,
                });

                await middleware(mockRequest as Request, mockResponse as Response, nextFunction);
                // ratelimiting capacity is set very low
                // request exceeds capacity
                // request will not be blocked
                expect(nextFunction).toBeCalled();
                expect(mockResponse.json).not.toBeCalled();
                expect(mockResponse.locals?.graphqlGate.success).toBe(false);
            });

            test('can be configured to throw an error for unbounded lists', () => {
                const unboundedSchema = `
                Query {
                    biglist: [List]
                }
                List {
                    stuff: String
                }
                `;
                expect(() =>
                    expressGraphQLRateLimiter(buildSchema(unboundedSchema), {
                        rateLimiter: {
                            type: 'TOKEN_BUCKET',
                            refillRate: 1,
                            capacity: 2,
                        },
                        enforceBoundedLists: true,
                    })
                ).toThrow();
            });

            test('can be configured to limit requests by depth', async () => {
                middleware = expressGraphQLRateLimiter(schema, {
                    rateLimiter: {
                        type: 'TOKEN_BUCKET',
                        refillRate: 1,
                        capacity: 20,
                    },
                    depthLimit: 3,
                });

                await middleware(mockRequest as Request, mockResponse as Response, nextFunction);
                // depthLimit is set very low
                // request will be blocked
                expect(mockResponse.json).toBeCalled();
                expect(mockResponse.locals?.graphqlGate.success).toBe(false);
                expect(nextFunction).not.toBeCalled();
            });

            // ? test for key expiry in redis cache?
            test('can be configured with a key expiry without error', () => {
                expect(() =>
                    expressGraphQLRateLimiter(schema, {
                        rateLimiter: {
                            type: 'TOKEN_BUCKET',
                            refillRate: 1,
                            capacity: 2,
                        },
                        redis: { keyExpiry: 4000 },
                    })
                ).not.toThrow();
            });
        });
    });

    describe('Middleware is Functional', () => {
        // Before each test configure a new middleware amd mock req, res objects.
        let ip = 0;
        beforeAll(() => {
            jest.useFakeTimers('modern');
            mockConnect.mockImplementation(() => new RedisMock());
        });

        afterAll(() => {
            jest.useRealTimers();
            jest.clearAllTimers();
            jest.clearAllMocks();
        });

        beforeEach(async () => {
            middleware = expressGraphQLRateLimiter(schema, {
                rateLimiter: {
                    type: 'TOKEN_BUCKET',
                    refillRate: 1,
                    capacity: 10,
                },
            });
            mockRequest = {
                body: {
                    // complexity should be 2 (1 Query + 1 Scalar)
                    query: `query {
                        scalars {
                            num
                        }
                    }`,
                },
                ip: `${(ip += 1)}`,
            };

            mockResponse = {
                json: jest.fn(),
                send: jest.fn(),
                set: jest.fn().mockReturnThis(),
                sendStatus: jest.fn(),
                status: jest.fn().mockReturnThis(),
                locals: {},
            };

            complexRequest = {
                // complexity should be 10 if 'first' is accounted for.
                // Query: 1, droid: 1, reviews 8: 1)
                body: {
                    query: `query {
                        droid(id: 1) {
                            name
                        }
                        reviews(episode: NEWHOPE, first: 8) {
                            episode
                            stars
                            commentary
                        }
                    } `,
                },
                ip: `${ip + 100}`,
            };
            nextFunction = jest.fn();
        });

        describe('Adds expected properties to res.locals', () => {
            test('Adds UNIX timestamp', async () => {
                jest.useRealTimers();
                await middleware(mockRequest as Request, mockResponse as Response, nextFunction);
                jest.useFakeTimers();

                // confirm that this is timestamp +/- 5 minutes of now.
                const now: number = Date.now().valueOf();
                const diff: number = Math.abs(
                    now - (mockResponse.locals?.graphqlGate.timestamp || 0)
                );
                expect(diff).toBeLessThan(5 * 60 * 1000);
            });

            test('adds complexity', async () => {
                await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

                expect(mockResponse.locals?.graphqlGate).toHaveProperty('complexity');
                expect(typeof mockResponse.locals?.graphqlGate.complexity).toBe('number');
                expect(mockResponse.locals?.graphqlGate.complexity).toBeGreaterThanOrEqual(0);
            });

            test('adds tokens', async () => {
                await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

                expect(mockResponse.locals?.graphqlGate).toHaveProperty('tokens');
                expect(typeof mockResponse.locals?.graphqlGate.tokens).toBe('number');
                expect(mockResponse.locals?.graphqlGate.tokens).toBeGreaterThanOrEqual(0);
            });

            test('adds success', async () => {
                await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

                expect(mockResponse.locals?.graphqlGate).toHaveProperty('success');
                expect(typeof mockResponse.locals?.graphqlGate.success).toBe('boolean');
            });

            test('adds depth', async () => {
                await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

                expect(mockResponse.locals?.graphqlGate).toHaveProperty('depth');
                expect(typeof mockResponse.locals?.graphqlGate.depth).toBe('number');
                expect(mockResponse.locals?.graphqlGate.depth).toBeGreaterThanOrEqual(0);
            });
        });

        describe('Correctly limits requests', () => {
            describe('Allows requests', () => {
                test('...a single request', async () => {
                    // successful request calls next without any arguments.
                    await middleware(
                        mockRequest as Request,
                        mockResponse as Response,
                        nextFunction
                    );
                    expect(nextFunction).toBeCalledTimes(1);
                    expect(nextFunction).toBeCalledWith();
                });

                test('Multiple valid requests at > 10 second intervals', async () => {
                    const requests = [];
                    for (let i = 0; i < 3; i++) {
                        requests.push(
                            middleware(
                                complexRequest as Request,
                                mockResponse as Response,
                                nextFunction
                            )
                        );
                        // advance the timers by 10 seconds for the next request
                        jest.advanceTimersByTime(10000);
                    }
                    await Promise.all(requests);
                    expect(nextFunction).toBeCalledTimes(3);
                    for (let i = 1; i <= 3; i++) {
                        expect(nextFunction).nthCalledWith(i);
                    }
                });

                test('Multiple valid requests at within one second', async () => {
                    const requests = [];

                    for (let i = 0; i < 3; i++) {
                        // Send 3 queries of complexity 2. These should all succeed
                        requests.push(
                            middleware(
                                mockRequest as Request,
                                mockResponse as Response,
                                nextFunction
                            )
                        );

                        // advance the timers by 20 miliseconds for the next request
                        jest.advanceTimersByTime(20);
                    }
                    await Promise.all(requests);
                    expect(nextFunction).toBeCalledTimes(3);
                    expect(nextFunction).toBeCalledWith();
                });
            });

            describe('BLOCKS requests', () => {
                test('A single request that exceeds capacity', async () => {
                    nextFunction = jest.fn();

                    const blockedRequest: Partial<Request> = {
                        // complexity should be 12 if 'first' is accounted for.
                        // scalars: 1, droid: 1, reviews (10 * (1 Review, 0 episode))
                        body: {
                            query: `query {
                                scalars {
                                    num
                                }
                                droid(id: 1) {
                                    name
                                }
                                reviews(episode: NEWHOPE, first: 10) {
                                    episode
                                    stars
                                    commentary
                                }
                            } `,
                        },
                        ip: '1100',
                    };

                    expect(nextFunction).not.toBeCalled();
                    await middleware(
                        blockedRequest as Request,
                        mockResponse as Response,
                        nextFunction
                    );
                    expect(mockResponse.status).toHaveBeenCalledWith(429);
                    expect(nextFunction).not.toBeCalled();

                    // FIXME: There are multiple functions to send a response
                    // json, send html, sendStatus etc. How do we check at least one was called
                    expect(mockResponse.json).toBeCalled();
                });

                test('Multiple queries that exceed token limit', async () => {
                    const requests = [];

                    for (let i = 0; i < 5; i++) {
                        // Send 5 queries of complexity 2. These should all succeed
                        requests.push(
                            middleware(
                                mockRequest as Request,
                                mockResponse as Response,
                                nextFunction
                            )
                        );

                        // advance the timers by 20 miliseconds for the next request
                        jest.advanceTimersByTime(20);
                    }

                    await Promise.all(requests);
                    // Send a 6th request that should be blocked.
                    const next: NextFunction = jest.fn();

                    const lastRequest = middleware(
                        mockRequest as Request,
                        mockResponse as Response,
                        next
                    );

                    await lastRequest;

                    expect(mockResponse.status).toHaveBeenCalledWith(429);
                    expect(next).not.toBeCalled();

                    // FIXME: See above comment on sending responses
                    expect(mockResponse.json).toBeCalled();
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
