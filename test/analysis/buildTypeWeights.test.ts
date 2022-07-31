import 'ts-jest';
import { buildSchema } from 'graphql';
import { GraphQLSchema } from 'graphql/type/schema';
import buildTypeWeightsFromSchema from '../../src/analysis/buildTypeWeights';

// these types allow the tests to overwite properties on the typeWeightObject

export interface TestField {
    resolveTo?: string;
    weight?: number;
}
interface TestFields {
    [index: string]: TestField;
}

interface TestType {
    weight: number;
    fields: TestFields;
}

interface TestTypeWeightObject {
    [index: string]: TestType;
}

describe('Test buildTypeWeightsFromSchema function', () => {
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
                query: {
                    weight: 1,
                    fields: {
                        name: { weight: 0 },
                        email: { weight: 0 },
                    },
                },
            });
        });

        test('a single mutation type', () => {
            schema = buildSchema(`
                type Mutation {
                    name: String
                    email: String
                }
            `);

            expect(buildTypeWeightsFromSchema(schema)).toEqual({
                mutation: {
                    weight: 10,
                    fields: {
                        name: { weight: 0 },
                        email: { weight: 0 },
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
                query: {
                    weight: 1,
                    fields: {
                        movie: { resolveTo: 'movie' },
                        user: { resolveTo: 'user' },
                    },
                },
                user: {
                    weight: 1,
                    fields: {
                        name: { weight: 0 },
                        email: { weight: 0 },
                    },
                },
                movie: {
                    weight: 1,
                    fields: {
                        name: { weight: 0 },
                        director: { weight: 0 },
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
                query: {
                    weight: 1,
                    fields: {
                        movie: { resolveTo: 'movie' },
                        user: { resolveTo: 'user' },
                    },
                },
                user: {
                    weight: 1,
                    fields: {
                        name: { weight: 0 },
                        film: { resolveTo: 'movie' },
                    },
                },
                movie: {
                    weight: 1,
                    fields: {
                        name: { weight: 0 },
                        director: { resolveTo: 'user' },
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
                test: {
                    weight: 1,
                    fields: {
                        num: { weight: 0 },
                        id: { weight: 0 },
                        float: { weight: 0 },
                        bool: { weight: 0 },
                        string: { weight: 0 },
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
                query: {
                    weight: 1,
                    fields: {
                        character: { resolveTo: 'character' },
                    },
                },
                character: {
                    weight: 1,
                    fields: {
                        id: { weight: 0 },
                        name: { weight: 0 },
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
                query: {
                    weight: 1,
                    fields: {
                        hero: { resolveTo: 'character' },
                    },
                },
                character: {
                    weight: 1,
                    fields: {
                        id: { weight: 0 },
                        name: { weight: 0 },
                    },
                },
                episode: {
                    weight: 0,
                    fields: {},
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
                character: {
                    weight: 1,
                    fields: {
                        id: { weight: 0 },
                        name: { weight: 0 },
                    },
                },
                human: {
                    weight: 1,
                    fields: {
                        id: { weight: 0 },
                        name: { weight: 0 },
                        homePlanet: { weight: 0 },
                    },
                },
                droid: {
                    weight: 1,
                    fields: {
                        id: { weight: 0 },
                        name: { weight: 0 },
                        primaryFunction: { weight: 0 },
                    },
                },
            });
        });

        // FIXME: need to figure out how to handle this situation. Skip for now.
        // The field 'friends' returns a list of an unknown number of objects.
        xtest('fields returning lists of objects of indeterminate size', () => {
            schema = buildSchema(`
                type Human {
                    id: ID!
                    name: String!
                    homePlanet: String
                    friends: [Human]
                }
            `);
            expect(buildTypeWeightsFromSchema(schema)).toEqual({
                human: {
                    weight: 1,
                    fields: {
                        id: { weight: 0 },
                        name: { weight: 0 },
                        hamePlanet: { weight: 0 },
                        friends: {
                            resolvesTo: 'human',
                            weight: expect.any(Function),
                        },
                    },
                },
            });
        });

        // TODO: Write tests for connection pagination convention
        xtest('connections pagination convention', () => {
            schema = buildSchema(`
            type Query {
                hero(id: ID): Character
            }
            type Character {
                id: ID!
                name: String!
                friends(first: Int): [Character]
                friendsConnection(first: Int, after: ID): FriendsConnection!
            }
            type FriendsConnection {
                totalCount: Int
                edges: [FriendsEdge]
                friends: [Character]
                pageInfo: PageInfo!
            }
            type FriendsEdge {
                cursor: ID!
                node: Character
            }
            type PageInfo {
                startCursor: ID
                endCursor: ID
                hasNextPage: Boolean!
            }
            `);
            expect(buildTypeWeightsFromSchema(schema)).toEqual({
                query: {
                    weight: 1,
                    fields: {
                        hero: { resolveTo: 'character' },
                    },
                },
                character: {
                    weight: 1,
                    fields: {
                        id: { weight: 0 },
                        name: { weight: 0 },
                        friends: { resolveTo: 'character', weight: expect.any(Function) },
                        friendsConnection: { resolveTo: 'friendsConnection' },
                    },
                },
                friendsConnection: {
                    weight: 2,
                    fields: {
                        totalCount: { weight: 0 },
                        // edges: {resolveTo: } //TODO: finish spec'ing out how the typeweight object should look for connections
                    },
                },
                friendsEdge: {},
                pageInfo: {},
            });
        });

        describe('mutation types...', () => {
            test('a mutation type and a query type', () => {
                schema = buildSchema(`
                    type Query {
                        name: String
                        email: String
                    }   
                
                    type Mutation {
                        name: String
                        email: String
                    }
                `);

                expect(buildTypeWeightsFromSchema(schema)).toEqual({
                    mutation: {
                        weight: 10,
                        fields: {
                            name: { weight: 0 },
                            email: { weight: 0 },
                        },
                    },
                    query: {
                        weight: 1,
                        fields: {
                            name: { weight: 0 },
                            email: { weight: 0 },
                        },
                    },
                });
            });

            test('a mutation type an input type', () => {
                schema = buildSchema(`
                type Mutation {
                    login(user: UserInput!): User
                }
                type User{
                    id: ID!
                    email: String!
                    password: String!
                }
                input UserInput {
                    email: String!
                    password: String!
                }
                `);

                expect(buildTypeWeightsFromSchema(schema)).toEqual({
                    mutation: {
                        weight: 10,
                        fields: {
                            login: { resolveTo: 'user' },
                        },
                    },
                    user: {
                        weight: 1,
                        fields: {
                            id: { weight: 0 },
                            email: { weight: 0 },
                            password: { weight: 0 },
                        },
                    },
                });
            });
        });

        describe('fields returning lists of objects of determinate size and...', () => {
            test('args include limiting keywords: "first", "last", "limit"', () => {
                schema = buildSchema(`
                    type Query {
                        reviews(episode: Episode!, first: Int): [Review]
                        heroes(episode: Episode!, last: Int): [Review]
                        villains(episode: Episode!, limit: Int): [Review]
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
                    query: {
                        weight: 1,
                        fields: {
                            reviews: {
                                resolveTo: 'review',
                                weight: expect.any(Function),
                            },
                            heroes: {
                                resolveTo: 'review',
                                weight: expect.any(Function),
                            },
                            villains: {
                                resolveTo: 'review',
                                weight: expect.any(Function),
                            },
                        },
                    },
                    review: {
                        weight: 1,
                        fields: {
                            stars: { weight: 0 },
                            commentary: { weight: 0 },
                            episode: { resolveTo: 'episode' },
                        },
                    },
                    episode: {
                        weight: 0,
                        fields: {},
                    },
                });
            });

            test('are not on the Query type', () => {
                schema = buildSchema(`
                    type Query {
                        reviews(episode: Episode!, first: Int): [Movie]
                    }
                    type Movie {
                        episode: Episode
                        stars: Int!
                        commentary: String
                        heroes(episode: Episode!, last: Int): [Character]
                        villains(episode: Episode!, limit: Int): [Character]
                    }
                    type Character {
                        name: String!
                    }
                    enum Episode {
                        NEWHOPE
                        EMPIRE
                        JEDI
                    }`);

                expect(buildTypeWeightsFromSchema(schema)).toEqual({
                    query: {
                        weight: 1,
                        fields: {
                            reviews: {
                                resolveTo: 'movie',
                                weight: expect.any(Function),
                            },
                        },
                    },
                    movie: {
                        weight: 1,
                        fields: {
                            stars: { weight: 0 },
                            commentary: { weight: 0 },
                            episode: { resolveTo: 'episode' },
                            heroes: { resolveTo: 'character', weight: expect.any(Function) },
                            villains: { resolveTo: 'character', weight: expect.any(Function) },
                        },
                    },
                    character: {
                        weight: 1,
                        fields: {
                            name: { weight: 0 },
                        },
                    },
                    episode: {
                        weight: 0,
                        fields: {},
                    },
                });
            });

            test('the list resolves to an enum or scalar', () => {
                schema = buildSchema(`
                    type Query {
                        episodes(first: Int): [Episode]
                        heroes(episode: Episode!, first: Int = 3): [Int]
                        villains(episode: Episode!, limit: Int! = 1): [String]
                    }
                    enum Episode {
                        NEWHOPE
                        EMPIRE
                        JEDI
                    }`);

                expect(buildTypeWeightsFromSchema(schema)).toEqual({
                    query: {
                        weight: 1,
                        fields: {
                            episodes: { resolveTo: 'episode' },
                            heroes: { weight: 0 },
                            villains: { weight: 0 },
                        },
                    },
                    episode: {
                        weight: 0,
                        fields: {},
                    },
                });
            });

            test('the list resolves to an enum or scalar and a custom scalar weight was configured', () => {
                schema = buildSchema(`
                    type Query {
                        episodes(first: Int): [Episode]
                        heroes(episode: Episode!, first: Int = 3): [Int]
                        villains(episode: Episode!, limit: Int! = 1): [String]
                    }
                    enum Episode {
                        NEWHOPE
                        EMPIRE
                        JEDI
                    }`);

                expect(buildTypeWeightsFromSchema(schema, { scalar: 11 })).toEqual({
                    query: {
                        weight: 1,
                        fields: {
                            episodes: {
                                resolveTo: 'episode',
                                weight: expect.any(Function),
                            },
                            heroes: {
                                resolveTo: 'int',
                                weight: expect.any(Function),
                            },
                            villains: {
                                resolveTo: 'string',
                                weight: expect.any(Function),
                            },
                        },
                    },
                    episode: {
                        weight: 11,
                        fields: {},
                    },
                });
            });
        });

        describe('union types with ...', () => {
            test('lists of union types and scalars', () => {
                schema = buildSchema(`
                    type Human{
                        name: String
                        homePlanet: String
                        search(first: Int!): [SearchResult]
                    }
                    type Droid {
                        name: String
                        primaryFunction: String
                        search(first: Int!): [SearchResult]
                    }
                    union SearchResult = Human | Droid
                    `);
                expect(buildTypeWeightsFromSchema(schema)).toEqual({
                    searchresult: {
                        weight: 1,
                        fields: {
                            name: { weight: 0 },
                            search: {
                                resolveTo: 'searchresult',
                                weight: expect.any(Function),
                            },
                        },
                    },
                    human: {
                        weight: 1,
                        fields: {
                            name: { weight: 0 },
                            homePlanet: { weight: 0 },
                            search: {
                                resolveTo: 'searchresult',
                                weight: expect.any(Function),
                            },
                        },
                    },
                    droid: {
                        weight: 1,
                        fields: {
                            name: { weight: 0 },
                            primaryFunction: { weight: 0 },
                            search: {
                                resolveTo: 'searchresult',
                                weight: expect.any(Function),
                            },
                        },
                    },
                });
            });

            test('interface types', () => {
                schema = buildSchema(`
                union SearchResult = Human | Droid
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
                    searchresult: {
                        weight: 1,
                        fields: {
                            id: { weight: 0 },
                            name: { weight: 0 },
                        },
                    },
                    character: {
                        weight: 1,
                        fields: {
                            id: { weight: 0 },
                            name: { weight: 0 },
                        },
                    },
                    human: {
                        weight: 1,
                        fields: {
                            name: { weight: 0 },
                            homePlanet: { weight: 0 },
                            id: { weight: 0 },
                        },
                    },
                    droid: {
                        weight: 1,
                        fields: {
                            name: { weight: 0 },
                            primaryFunction: { weight: 0 },
                            id: { weight: 0 },
                        },
                    },
                });
            });

            test('object types', () => {
                schema = buildSchema(`
                    union SearchResult = Human | Droid
                    type Human{
                        name: String
                        homePlanet: String
                        info: Info
                        search(first: Int!): [SearchResult]
                    }
                    type Droid {
                        name: String
                        primaryFunction: String
                        info: Info
                        search(first: Int!): [SearchResult]
                    }
                    type Info {
                        height: Int
                    }
                    `);
                expect(buildTypeWeightsFromSchema(schema)).toEqual({
                    searchresult: {
                        weight: 1,
                        fields: {
                            name: { weight: 0 },
                            search: {
                                resolveTo: 'searchresult',
                                weight: expect.any(Function),
                            },
                            info: { resolveTo: 'info' },
                        },
                    },
                    human: {
                        weight: 1,
                        fields: {
                            name: { weight: 0 },
                            homePlanet: { weight: 0 },
                            search: {
                                resolveTo: 'searchresult',
                                weight: expect.any(Function),
                            },
                            info: { resolveTo: 'info' },
                        },
                    },
                    droid: {
                        weight: 1,
                        fields: {
                            name: { weight: 0 },
                            primaryFunction: { weight: 0 },
                            search: {
                                resolveTo: 'searchresult',
                                weight: expect.any(Function),
                            },
                            info: { resolveTo: 'info' },
                        },
                    },
                    info: {
                        weight: 1,
                        fields: {
                            height: { weight: 0 },
                        },
                    },
                });
            });

            test('enum types', () => {
                schema = buildSchema(`
                    union SearchResult = Human | Droid
                    type Human{
                        name: String
                        homePlanet: String
                        episode: Episode
                        search(first: Int!): [SearchResult]
                    }
                    type Droid {
                        name: String
                        primaryFunction: String
                        episode: Episode
                        search(first: Int!): [SearchResult]
                    }
                    enum Episode {
                        NEWHOPE
                        EMPIRE
                        JEDI
                    }
                    `);
                expect(buildTypeWeightsFromSchema(schema)).toEqual({
                    searchresult: {
                        weight: 1,
                        fields: {
                            episode: { resolveTo: 'episode' },
                            name: { weight: 0 },
                            search: {
                                resolveTo: 'searchresult',
                                weight: expect.any(Function),
                            },
                        },
                    },
                    human: {
                        weight: 1,
                        fields: {
                            name: { weight: 0 },
                            homePlanet: { weight: 0 },
                            search: {
                                resolveTo: 'searchresult',
                                weight: expect.any(Function),
                            },
                            episode: { resolveTo: 'episode' },
                        },
                    },
                    droid: {
                        weight: 1,
                        fields: {
                            name: { weight: 0 },
                            primaryFunction: { weight: 0 },
                            search: {
                                resolveTo: 'searchresult',
                                weight: expect.any(Function),
                            },
                            episode: { resolveTo: 'episode' },
                        },
                    },
                    episode: {
                        weight: 0,
                        fields: {},
                    },
                });
            });
        });

        test('Unions with no fields overlapping', () => {
            schema = buildSchema(`
            union SearchResult = Human | Droid
            type Human{
                name: String
                homePlanet: String
            }
            type Droid {
                primaryFunction: String
                id: String
            }
            `);
            expect(buildTypeWeightsFromSchema(schema)).toEqual({
                searchresult: {
                    weight: 1,
                    fields: {},
                },
                human: {
                    weight: 1,
                    fields: {
                        name: { weight: 0 },
                        homePlanet: { weight: 0 },
                    },
                },
                droid: {
                    weight: 1,
                    fields: {
                        primaryFunction: { weight: 0 },
                        id: { weight: 0 },
                    },
                },
            });
        });

        describe('Not null operator (!) is used', () => {
            test('on a scalar, enum or object type', () => {
                schema = buildSchema(`
                type Human{
                    homePlanet: String!
                    age: Int!
                    isHero: Boolean!
                    droids: Droid!
                    episode: Episode!
                }
                type Droid {
                    primaryFunction: String
                }
                enum Episode {
                    NEWHOPE
                    EMPIRE
                    JEDI
                }
                `);

                expect(buildTypeWeightsFromSchema(schema)).toEqual({
                    human: {
                        weight: 1,
                        fields: {
                            homePlanet: {
                                weight: 0,
                            },
                            age: {
                                weight: 0,
                            },
                            isHero: {
                                weight: 0,
                            },
                            droids: {
                                resolveTo: 'droid',
                            },
                            episode: {
                                resolveTo: 'episode',
                            },
                        },
                    },
                    droid: {
                        weight: 1,
                        fields: {
                            primaryFunction: {
                                weight: 0,
                            },
                        },
                    },
                    episode: {
                        weight: 0,
                        fields: {},
                    },
                });
            });

            test('on list types', () => {
                schema = buildSchema(`
                type Planet{
                    droids(first: Int!): [Droid]!
                    heroDroids(first: Int!): [Droid!]
                    villainDroids(first: Int!):[Droid!]!
                }
                type Droid {
                    primaryFunction: String
                }`);

                expect(buildTypeWeightsFromSchema(schema)).toEqual({
                    planet: {
                        weight: 1,
                        fields: {
                            droids: {
                                resolveTo: 'droid',
                                weight: expect.any(Function),
                            },
                            heroDroids: {
                                resolveTo: 'droid',
                                weight: expect.any(Function),
                            },
                            villainDroids: {
                                resolveTo: 'droid',
                                weight: expect.any(Function),
                            },
                        },
                    },
                    droid: {
                        weight: 1,
                        fields: {
                            primaryFunction: {
                                weight: 0,
                            },
                        },
                    },
                });
            });

            test('on union types', () => {
                schema = buildSchema(`
                union SearchResult = Human | Droid
                type Human{
                    age: Int!
                    name: String
                    homePlanet: String
                    search(first: Int!): [SearchResult!]!
                }
                type Droid {
                    age: Int!
                    name: String
                    primaryFunction: String!
                    search(first: Int!): [SearchResult!]!
                }`);
                expect(buildTypeWeightsFromSchema(schema)).toEqual({
                    searchresult: {
                        weight: 1,
                        fields: {
                            name: { weight: 0 },
                            age: { weight: 0 },
                            search: {
                                resolveTo: 'searchresult',
                                weight: expect.any(Function),
                            },
                        },
                    },
                    human: {
                        weight: 1,
                        fields: {
                            name: { weight: 0 },
                            age: { weight: 0 },
                            homePlanet: { weight: 0 },
                            search: {
                                resolveTo: 'searchresult',
                                weight: expect.any(Function),
                            },
                        },
                    },
                    droid: {
                        weight: 1,
                        fields: {
                            name: { weight: 0 },
                            age: { weight: 0 },
                            primaryFunction: { weight: 0 },
                            search: {
                                resolveTo: 'searchresult',
                                weight: expect.any(Function),
                            },
                        },
                    },
                });
            });
        });

        // TODO: Tests should be written to account for the additional scenarios possible in a schema
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

                type Mutation {
                    updateUser(id: ID!, password: String!): User
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
                query: {
                    weight: 1,
                    fields: {
                        movie: { resolveTo: 'movie' },
                        user: { resolveTo: 'user' },
                    },
                },
                mutation: {
                    weight: 10,
                    fields: {
                        updateUser: { resolveTo: 'user' },
                    },
                },
                user: {
                    weight: 1,
                    fields: {
                        name: { weight: 0 },
                        film: { resolveTo: 'movie' },
                    },
                },
                movie: {
                    weight: 1,
                    fields: {
                        name: { weight: 0 },
                        director: { resolveTo: 'user' },
                    },
                },
            };
        });

        // this is only if we choose to have 'query' as its own property (seperate from object types) in the user configuration options
        test('query parameter', () => {
            const typeWeightObject = buildTypeWeightsFromSchema(schema, {
                query: 2,
            });
            expectedOutput.query.weight = 2;

            expect(typeWeightObject).toEqual(expectedOutput);
        });

        test('mutation parameter', () => {
            const typeWeightObject = buildTypeWeightsFromSchema(schema, {
                mutation: 20,
            });
            expectedOutput.mutation.weight = 20;

            expect(typeWeightObject).toEqual(expectedOutput);
        });

        test('object parameter', () => {
            const typeWeightObject = buildTypeWeightsFromSchema(schema, {
                object: 2,
            });

            expectedOutput.user.weight = 2;
            expectedOutput.movie.weight = 2;
            // expectedOutput.query.weight = 2;

            expect(typeWeightObject).toEqual(expectedOutput);
        });

        test('object parameter set to 0', () => {
            const typeWeightObject = buildTypeWeightsFromSchema(schema, {
                object: 0,
            });

            expectedOutput.user.weight = 0;
            expectedOutput.movie.weight = 0;
            // expectedOutput.query.weight = 2;

            expect(typeWeightObject).toEqual(expectedOutput);
        });

        test('scalar parameter', () => {
            const typeWeightObject = buildTypeWeightsFromSchema(schema, {
                scalar: 2,
            });

            expectedOutput.user.fields.name.weight = 2;
            expectedOutput.movie.fields.name.weight = 2;

            expect(typeWeightObject).toEqual(expectedOutput);
        });

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
        xtest('schema is invalid', () => {});
    });
});
