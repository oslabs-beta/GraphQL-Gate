import { buildSchema } from 'graphql';
import { GraphQLSchema } from 'graphql/type/schema';
import buildTypeWeightsFromSchema from '../../src/analysis/buildTypeWeights';

describe('Test buildTypeWeightsFromSchema function', () => {
    let schema: GraphQLSchema;

    describe('creates the type weight object from graphql schema object with...', () => {
        test('a single query type', () => {
            schema = buildSchema(`
                Query {
                    name: String
                    email: String
                }`);

            const typeWeightObject = buildTypeWeightsFromSchema(schema);

            expect(typeWeightObject).toEqual({
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
                User {
                    name: String
                    email: String
                }

                Movie {
                    name: String
                    director: String
                }`);

            const typeWeightObject = buildTypeWeightsFromSchema(schema);

            expect(typeWeightObject).toEqual({
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
                Query {
                    User {
                        name: String
                        email: String
                    }

                    Movie {
                        name: String
                        director: User
                    }  
                }`);

            const typeWeightObject = buildTypeWeightsFromSchema(schema);

            expect(typeWeightObject).toEqual({
                Query: {
                    weight: 1,
                    fields: {
                        User: 1,
                        Movie: 1,
                    },
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
                        director: 1,
                    },
                },
            });
        });
    });

    describe('changes type weight object with user configuration of query of...', () => {
        let expectedOutput: TypeWeightObject;

        beforeEach(() => {
            schema = buildSchema(`
                Query {
                    User {
                        name: String
                        email: String
                    }

                    Movie {
                        name: String
                        director: User
                    }  
                }`);

            expectedOutput = {
                Query: {
                    weight: 1,
                    fields: {
                        User: 1,
                        Movie: 1,
                    },
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
                        director: 1,
                    },
                },
            };
        });

        test('query parameter', () => {
            const typeWeightObject = buildTypeWeightsFromSchema(schema, {
                query: 2,
            });
            expectedOutput.query.weight = 2;

            expect(typeWeightObject).toEqual({ expectedOutput });
        });

        test('all objects types', () => {
            const typeWeightObject = buildTypeWeightsFromSchema(schema, {
                object: 2,
            });
            expectedOutput.query.fields.user = 2;
            expectedOutput.query.fields.movie = 2;
            expectedOutput.user.weight = 2;
            expectedOutput.movie.weight = 2;
            expectedOutput.movie.fields.director = 2;

            expect(typeWeightObject).toEqual({ expectedOutput });
        });
    });

    describe('throws an error on...', () => {});
});
