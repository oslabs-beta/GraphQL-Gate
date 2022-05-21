import { buildSchema } from 'graphql';
import { GraphQLSchema } from 'graphql/type/schema';
import buildTypeWeightsFromSchema from '../../src/analysis/buildTypeWeights';

xdescribe('Test buildTypeWeightsFromSchema function', () => {
    let schema: GraphQLSchema;

    // this is dependant on the default type weight settings for the function
    describe('creates the "type weight object" from a graphql schema object with...', () => {
        test('a single query type', () => {
            schema = buildSchema(`
                type Query {
                    name: String
                    email: String
                }
            `);

            expect(buildTypeWeightsFromSchema(schema)).toEqual({
                Query: {
                    weight: 1,
                    fields: {
                        name: 0,
                        email: 0,
                    },
                },
            });
        });

        test('multiple types', () => {
            schema = buildSchema(`
                type User {
                    name: String
                    email: String
                }

                type Movie {
                    name: String
                    director: String
                }
            `);

            expect(buildTypeWeightsFromSchema(schema)).toEqual({
                User: {
                    weight: 1,
                    fields: {
                        name: 0,
                        email: 0,
                    },
                },
                Movie: {
                    weight: 1,
                    fields: {
                        name: 0,
                        director: 0,
                    },
                },
            });
        });

        test('nested object types', () => {
            schema = buildSchema(`
                type Query {
                    user: User
                    movie: Movie
                }
                
                type User {
                    name: String
                    email: String
                }
                
                type Movie {
                    name: String
                    director: User
                }  
            `);

            expect(buildTypeWeightsFromSchema(schema)).toEqual({
                Query: {
                    weight: 1,
                    fields: {},
                },
                User: {
                    weight: 1,
                    fields: {
                        name: 0,
                        email: 0,
                    },
                },
                Movie: {
                    weight: 1,
                    fields: {
                        name: 0,
                    },
                },
            });
        });

        test('all scalar types', () => {
            schema = buildSchema(`
                type Test {
                    num: Int,
                    id: ID,
                    float: Float,
                    bool: Boolean,
                    string: String
                } 
            `);

            expect(buildTypeWeightsFromSchema(schema)).toEqual({
                Test: {
                    weight: 1,
                    fields: {
                        num: 0,
                        id: 0,
                        float: 0,
                        bool: 0,
                        string: 0,
                    },
                },
            });
        });

        // TODO: Tests should be written to acount for the additional scenarios possible in a schema
        // Mutation type
        // Subscription type
        // List type
        // Enem types
        // Interface
        // Unions
        // Input types
    });

    describe('changes "type weight object" type weights with user configuration of...', () => {
        let expectedOutput: TypeWeightObject;

        beforeEach(() => {
            schema = buildSchema(`
                type Query {
                    user: User
                    movie: Movie
                }
                
                type User {
                    name: String
                    email: String
                }
                
                type Movie {
                    name: String
                    director: User
                }   
            `);

            // This expected output is using default type weight settings.
            // Each test will override values for feild weights configuration.
            expectedOutput = {
                Query: {
                    weight: 1,
                    fields: {},
                },
                User: {
                    weight: 1,
                    fields: {
                        name: 0,
                        email: 0,
                    },
                },
                Movie: {
                    weight: 1,
                    fields: {
                        name: 0,
                    },
                },
            };
        });

        // this is only if we choose to have 'query' as its own property (seperate from object types) in the user configuration options
        xtest('query parameter', () => {
            const typeWeightObject = buildTypeWeightsFromSchema(schema, {
                query: 2,
            });
            expectedOutput.query.weight = 2;

            expect(typeWeightObject).toEqual({ expectedOutput });
        });

        test('object parameter', () => {
            const typeWeightObject = buildTypeWeightsFromSchema(schema, {
                object: 2,
            });

            expectedOutput.user.weight = 2;
            expectedOutput.movie.weight = 2;

            expect(typeWeightObject).toEqual({ expectedOutput });
        });

        test('scalar parameter', () => {
            const typeWeightObject = buildTypeWeightsFromSchema(schema, {
                scalar: 2,
            });

            expectedOutput.user.fields.name = 2;
            expectedOutput.user.fields.email = 2;
            expectedOutput.movie.fields.name = 2;

            expect(typeWeightObject).toEqual({ expectedOutput });
        });

        // TODO: Tests should be written for the remaining configuration options
        // mutations
        // connections
        // subscriptions
    });

    describe('throws an error if...', () => {
        beforeEach(() => {
            schema = buildSchema(`
                type Query {
                    user: User
                    movie: Movie
                }
                
                type User {
                    name: String
                    email: String
                }
                
                type Movie {
                    name: String
                    director: User
                }   
            `);
        });

        test('user configures the type weights with negative numbers', () => {
            // check that the error thrown from the function includes the substring 'negative' to inform the user of negative problem
            expect(() => buildTypeWeightsFromSchema(schema, { object: -1 })).toThrowError(
                'negative'
            );
            expect(() => buildTypeWeightsFromSchema(schema, { mutation: -1 })).toThrowError(
                'negative'
            );
            expect(() => buildTypeWeightsFromSchema(schema, { connection: -1 })).toThrowError(
                'negative'
            );
            expect(() => buildTypeWeightsFromSchema(schema, { scalar: -1 })).toThrowError(
                'negative'
            );
        });
    });
});
