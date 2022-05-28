import { buildSchema } from 'graphql';
import { GraphQLSchema } from 'graphql/type/schema';
import buildTypeWeightsFromSchema from '../../src/analysis/buildTypeWeights';

// these types allow the tests to overwite properties on the typeWeightObject
interface TestFields {
    [index: string]: number;
}

interface TestType {
    weight: number;
    fields: TestFields;
}

interface TestTypeWeightObject {
    [index: string]: TestType;
}

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
                type Query {
                    user: User,
                    movie: Movie,
                }
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
                    film: Movie
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

        test('types with arguments', () => {
            schema = buildSchema(`
                type Query {
                    character(id: ID!): Character
                }
                type Character {
                    id: ID!
                    name: String!
                }`);
            expect(buildTypeWeightsFromSchema(schema)).toEqual({
                Query: {
                    weight: 1,
                    fields: {},
                },
                Character: {
                    weight: 1,
                    fields: {
                        id: 0,
                        name: 0,
                    },
                },
            });
        });

        test('enum types', () => {
            schema = buildSchema(`
                type Query {
                    hero(episode: Episode): Character
                }
                type Character {
                    id: ID!
                    name: String!
                }
                enum Episode {
                    NEWHOPE
                    EMPIRE
                    JEDI
                }`);
            expect(buildTypeWeightsFromSchema(schema)).toEqual({
                Query: {
                    weight: 1,
                    fields: {},
                },
                Character: {
                    weight: 1,
                    fields: {
                        id: 0,
                        name: 0,
                    },
                },
                Episode: {
                    weight: 0,
                    fields: {},
                },
            });
        });

        test('fields returning lists of objects of determinate size', () => {
            schema = buildSchema(`
                type Query {
                    reviews(episode: Episode!, first: Int): [Review]
                }
                type Review {
                    episode: Episode
                    stars: Int!
                    commentary: String
                }
                enum Episode {
                    NEWHOPE
                    EMPIRE
                    JEDI
                }`);
            expect(buildTypeWeightsFromSchema(schema)).toEqual({
                Query: {
                    weight: 1,
                    fields: {
                        // FIXME: check the best solution during implementation and update the tests here.
                        reviews: (arg: number, type: Type) => arg * type.weight,
                        // code from PR review -> reviews: (type) => args[multiplierName] * typeWeightObject[type].weight
                    },
                },
                Review: {
                    weight: 1,
                    fields: {
                        stars: 0,
                        commentary: 0,
                    },
                },
                Episode: {
                    weight: 0,
                    fields: {},
                },
            });
        });

        // TODO: need to figure out how to handle this situation. Skip for now.
        // The field friends returns a list of an unknown number of objects.
        xtest('fields returning lists of objects of indetermitae size', () => {
            schema = buildSchema(`
                type Human {
                    id: ID!
                    name: String!
                    homePlanet: String
                    friends: [Human]
                }
            `);
            expect(buildTypeWeightsFromSchema(schema)).toEqual({
                Human: {
                    weight: 1,
                    fields: {
                        // FIXME: check the best solution during implementation and update the tests here.
                        friends: (arg: number, type: Type) => arg * type.weight,
                    },
                },
            });
        });

        test('interface types', () => {
            schema = buildSchema(`
                interface Character {
                    id: ID!
                    name: String!                    
                }
            
                type Human implements Character {
                    id: ID!
                    name: String!
                    homePlanet: String
                }
            
                type Droid implements Character {
                    id: ID!
                    name: String!                
                    primaryFunction: String
                }`);
            expect(buildTypeWeightsFromSchema(schema)).toEqual({
                Character: {
                    weight: 1,
                    fields: {
                        id: 0,
                        name: 0,
                    },
                },
                Human: {
                    weight: 1,
                    fields: {
                        id: 0,
                        name: 0,
                        homePlanet: 0,
                    },
                },
                Droid: {
                    weight: 1,
                    fields: {
                        id: 0,
                        name: 0,
                        primaryFunction: 0,
                    },
                },
                Episode: {
                    weight: 0,
                    fields: {},
                },
            });
        });

        test('union tyes', () => {
            schema = buildSchema(`
                union SearchResult = Human | Droid
                type Human{
                    homePlanet: String
                }
                type Droid {
                    primaryFunction: String
                }`);
            expect(buildTypeWeightsFromSchema(schema)).toEqual({
                SearchResult: {
                    weight: 1,
                    fields: {},
                },
                human: {
                    weight: 1,
                    fields: {
                        homePlanet: 0,
                    },
                },
                droid: {
                    weight: 1,
                    fields: {
                        primaryFunction: 0,
                    },
                },
            });
        });

        // TODO: Tests should be written to acount for the additional scenarios possible in a schema
        // Mutation type
        // Input types (a part of mutations?)
        // Subscription type
    });

    describe('changes "type weight object" type weights with user configuration of...', () => {
        let expectedOutput: TestTypeWeightObject;

        beforeEach(() => {
            schema = buildSchema(`
                type Query {
                    user(id: ID!): User
                    movie(id: ID!): Movie
                }
                
                type User {
                    name: String
                    film: Movie
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

        // TODO: throw validation error if schema is invalid
        test('schema is invalid', () => {});
    });
});
