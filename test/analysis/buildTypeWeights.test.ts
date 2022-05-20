import { buildSchema } from 'graphql';
import { GraphQLSchema } from 'graphql/type/schema';
import buildTypeWeightsFromSchema from '../../src/analysis/buildTypeWeights';

describe('Test buildTypeWeightsFromSchema function', () => {
    let schema: GraphQLSchema;

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
                    fields: {},
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
            expect(buildTypeWeightsFromSchema(schema, { object: -1 })).toThrow();
            expect(buildTypeWeightsFromSchema(schema, { mutation: -1 })).toThrow();
            expect(buildTypeWeightsFromSchema(schema, { connection: -1 })).toThrow();
            expect(buildTypeWeightsFromSchema(schema, { scalar: -1 })).toThrow();
        });
    });
});
