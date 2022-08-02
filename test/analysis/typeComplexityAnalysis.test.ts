import { parse } from 'graphql';
import ASTParser from '../../src/analysis/ASTParser';
import { TypeWeightObject, Variables } from '../../src/@types/buildTypeWeights';

/** 
 * Here is the schema that creates the following 'typeWeightsObject' used for the tests
 * 
    directive @listCost(cost: Int!) on FIELD_DEFINITION

    type Query {
        hero(episode: Episode): Character
        heroUnion(episode: Episode): SearchResult
        reviews(episode: Episode!, first: Int): [Review]
        search(text: String): [SearchResult] @listCost(cost: 10)
        character(id: ID!): Character
        droid(id: ID!): Droid
        human(id: ID!): Human
        scalars: Scalars
        nonNull: [Droid!]!
    }    

    enum Episode {
        NEWHOPE
        EMPIRE
        JEDI
    }

    interface Character {
        id: ID!
        name: String!
        friends(first: Int): [Character]
        appearsIn: [Episode]!
        scalarList(first: Int): [Int]
    }

    type Human implements Character {
        id: ID!
        name: String!
        homePlanet: String
        friends(first: Int): [Character]
        humanFriends(first: Int): [Human]
        appearsIn: [Episode]!
    }

    type Droid implements Character {
        id: ID!
        name: String!
        friends(first: Int): [Character]
        primaryFunction: String
        appearsIn: [Episode]!
    }

    type Review {
        episode: Episode
        stars: Int!
        commentary: String
    }

    union SearchResult = Human | Droid

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
        scalars: Scalars
    }

    type Mutation {
        createReview(episode: Episode, review: ReviewInput!): Review
    }

    input ReviewInput {
        stars: Int!
        commentary: String
    }
    


 *   
 * TODO: extend this schema to include mutations, subscriptions and pagination
 * 

    type Subscription {
        reviewAdded(episode: Episode): Review
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

    add
        friendsConnection(first: Int, after: ID): FriendsConnection!
    to character, human and droid
*/

// Mocks typed with <result, arg array>
let mockWeightFunction: jest.Mock<number, []>;
let mockHumanFriendsFunction: jest.Mock<number, []>;
let mockDroidFriendsFunction: jest.Mock<number, []>;
let mockCharacterFriendsFunction: jest.Mock<number, []>;
let nonNullMockWeightFunction: jest.Mock<number, []>;

// this object is created by the schema above for use in all the tests below
let typeWeights: TypeWeightObject;

let queryParser: ASTParser;

describe('Test getQueryTypeComplexity function', () => {
    beforeEach(() => {
        // Reset mocks before each test to avoid errors when running tests in parallel
        mockWeightFunction = jest.fn();
        mockHumanFriendsFunction = jest.fn();
        mockDroidFriendsFunction = jest.fn();
        mockCharacterFriendsFunction = jest.fn();
        nonNullMockWeightFunction = jest.fn();

        typeWeights = {
            query: {
                // object type
                weight: 1,
                fields: {
                    reviews: {
                        resolveTo: 'review',
                        weight: mockWeightFunction,
                    },
                    hero: {
                        resolveTo: 'character',
                    },
                    heroUnion: {
                        resolveTo: 'searchresult',
                    },
                    search: {
                        resolveTo: 'searchresult',
                        weight: 10,
                    },
                    character: {
                        resolveTo: 'character',
                    },
                    droid: {
                        resolveTo: 'droid',
                    },
                    human: {
                        resolveTo: 'human',
                    },
                    scalars: {
                        resolveTo: 'scalars',
                    },
                    nonNull: {
                        resolveTo: 'droid',
                        weight: nonNullMockWeightFunction,
                    },
                },
            },
            mutation: {
                weight: 10,
                fields: {
                    createReview: { resolveTo: 'review' },
                },
            },
            episode: {
                // enum
                weight: 0,
                fields: {},
            },
            character: {
                // interface
                weight: 1,
                fields: {
                    id: { weight: 0 },
                    name: { weight: 0 },
                    appearsIn: { resolveTo: 'episode' },
                    friends: {
                        resolveTo: 'character',
                        weight: mockCharacterFriendsFunction,
                    },
                    humanFriends: {
                        resolveTo: 'human',
                        weight: mockHumanFriendsFunction,
                    },
                    scalarList: {
                        weight: 0,
                    },
                },
            },
            human: {
                // implements an interface
                weight: 1,
                fields: {
                    id: { weight: 0 },
                    name: { weight: 0 },
                    appearsIn: { resolveTo: 'episode' },
                    homePlanet: { weight: 0 },
                    friends: {
                        resolveTo: 'character',
                        weight: mockHumanFriendsFunction,
                    },
                    humanFriends: {
                        resolveTo: 'human',
                        weight: mockHumanFriendsFunction,
                    },
                },
            },
            droid: {
                // implements an interface
                weight: 1,
                fields: {
                    id: { weight: 0 },
                    name: { weight: 0 },
                    appearsIn: { resolveTo: 'episode' },
                    primaryFunction: { weight: 0 },
                    friends: {
                        resolveTo: 'character',
                        weight: mockDroidFriendsFunction,
                    },
                },
            },
            review: {
                weight: 1,
                fields: {
                    episode: { resolveTo: 'episode' },
                    stars: { weight: 0 },
                    commentary: { weight: 0 },
                },
            },
            searchresult: {
                // union type
                weight: 1,
                fields: {
                    id: { weight: 0 },
                    name: { weight: 0 },
                    friends: { resolveTo: 'character', weight: mockWeightFunction },
                    appearsIn: { resolveTo: 'episode' },
                },
            },
            scalars: {
                weight: 1, // object weight is 1, all scalar feilds have weight 0
                fields: {
                    num: { weight: 0 },
                    id: { weight: 0 },
                    float: { weight: 0 },
                    bool: { weight: 0 },
                    string: { weight: 0 },
                    test: { resolveTo: 'test' },
                },
            },
            test: {
                weight: 1,
                fields: {
                    name: { weight: 0 },
                    scalars: { resolveTo: 'scalars' },
                },
            },
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    let query = '';
    let variables: Variables = {};

    describe('Calculates the correct type complexity for queries', () => {
        beforeEach(() => {
            queryParser = new ASTParser(typeWeights, variables);
        });
        test('with one feild', () => {
            query = `query { scalars { num } }`;
            expect(queryParser.processQuery(parse(query))).toBe(2); // Query 1 + Scalars 1
        });

        xtest('with one with capital first letter for field', () => {
            query = `query { Scalars { num } }`;
            expect(queryParser.processQuery(parse(query))).toBe(2); // Query 1 + Scalars 1
        });

        test('with two or more fields', () => {
            query = `query { scalars { num } test { name } }`;
            expect(queryParser.processQuery(parse(query))).toBe(3); // Query 1 + scalars 1 + test 1
        });

        test('with one level of nested fields', () => {
            query = `query { scalars { num, test { name } } }`;
            expect(queryParser.processQuery(parse(query))).toBe(3); // Query 1 + scalars 1 + test 1
        });

        test('with multiple levels of nesting', () => {
            query = `query { scalars { num, test { name, scalars { id } } } }`;
            expect(queryParser.processQuery(parse(query))).toBe(4); // Query 1 + scalars 1 + test 1 + scalars 1
        });

        test('with aliases', () => {
            query = `query { foo: scalars { num } bar: scalars { id }}`;
            expect(queryParser.processQuery(parse(query))).toBe(3); // Query 1 + scalar 1 + scalar 1
        });

        test('with all scalar fields', () => {
            query = `query { scalars { id, num, float, bool, string } }`;
            expect(queryParser.processQuery(parse(query))).toBe(2); // Query 1 + scalar 1
        });

        test('with arguments and variables', () => {
            query = `query { hero(episode: EMPIRE) { id, name } }`;
            expect(queryParser.processQuery(parse(query))).toBe(2); // Query 1 + hero/character 1
            query = `query { human(id: 1) { id, name, homePlanet } }`;
            expect(queryParser.processQuery(parse(query))).toBe(2); // Query 1 + human/character 1
            // argument passed in as a variable
            variables = { ep: 'EMPIRE' };
            queryParser = new ASTParser(typeWeights, variables);
            query = `query variableQuery ($ep: Episode){ hero(episode: $ep) { id, name } }`;
            expect(queryParser.processQuery(parse(query))).toBe(2); // Query 1 + hero/character 1
        });

        describe('with fragments', () => {
            test('that have a complexity of zero', () => {
                query = `
                query {
                    leftComparison: hero(episode: EMPIRE) {
                    ...comparisonFields
                    }
                    rightComparison: hero(episode: JEDI) {
                    ...comparisonFields
                    }
                }
                
                fragment comparisonFields on Character {
                    name
                    appearsIn
                }`;
                // Query 1 + 2*(appearsIn/episode 0 + name/string 0)
                expect(queryParser.processQuery(parse(query))).toBe(3);
            });

            test('that contain an object and a non-zero complexity', () => {
                query = `
                query {
                    leftComparison: hero(episode: EMPIRE) {
                    ...comparisonFields
                    }
                    rightComparison: hero(episode: JEDI) {
                    ...comparisonFields
                    }
                }
                
                fragment comparisonFields on Character {
                    name
                    appearsIn
                    friends(first: 3) {
                        name
                    }
                }`;
                mockCharacterFriendsFunction.mockReturnValueOnce(3);
                variables = { first: 3 };
                queryParser = new ASTParser(typeWeights, variables);
                // Query 1 + 2*(character 1 + appearsIn/episode 0 + 3 * friends/character 1)
                expect(queryParser.processQuery(parse(query))).toBe(9);
            });

            test('that use a variable', () => {
                query = `
                query {
                    leftComparison: hero(episode: EMPIRE) {
                    ...comparisonFields
                    }
                    rightComparison: hero(episode: JEDI) {
                    ...comparisonFields
                    }
                }
                
                fragment comparisonFields on Character {
                    name
                    appearsIn
                    friends(first: $first) {
                        name
                    }
                }`;
                mockCharacterFriendsFunction.mockReturnValueOnce(3);
                variables = { first: 3 };
                queryParser = new ASTParser(typeWeights, variables);
                // Query 1 + 2*(character 1 + appearsIn/episode 0 + 3 * friends/character 1)
                expect(queryParser.processQuery(parse(query))).toBe(9);
            });

            test('recalculates fragment complexity for individual queries', () => {
                query = `
                query {
                    leftComparison: hero(episode: EMPIRE) {
                    ...comparisonFields
                    }
                    rightComparison: hero(episode: JEDI) {
                    ...comparisonFields
                    }
                }
                
                fragment comparisonFields on Character {
                    name
                    appearsIn
                    friends(first: 3) {
                        name
                    }
                }`;
                mockCharacterFriendsFunction.mockReturnValueOnce(3);

                variables = { first: 3 };
                queryParser = new ASTParser(typeWeights, variables);
                // Query 1 + 2*(character 1 + appearsIn/episode 0 + 3 * friends/character 1)
                expect(queryParser.processQuery(parse(query))).toBe(9);

                query = `
                query {
                    leftComparison: hero(episode: EMPIRE) {
                    ...comparisonFields
                    }
                    rightComparison: hero(episode: JEDI) {
                    ...comparisonFields
                    }
                }
                
                fragment comparisonFields on Character {
                    name
                    appearsIn
                }`;
                mockCharacterFriendsFunction.mockReturnValueOnce(3);
                variables = { first: 3 };
                queryParser = new ASTParser(typeWeights, variables);
                // Query 1 + 2*(character 1 + 0 selectionCost)
                expect(queryParser.processQuery(parse(query))).toBe(3);
            });
        });

        describe('with inline fragments', () => {
            describe('on union types', () => {
                let unionTypeWeights: TypeWeightObject;
                let mockHumanCharacterFriendsFunction: jest.Mock<number, []>;
                beforeEach(() => {
                    // type Query {
                    //     hero(episode: Episode): Character
                    // }
                    // type Character = Human | Droid
                    //
                    // type Human  {
                    //     name: String!
                    //     homePlanet: String
                    //     friends(first: Int): [Character]
                    //     humanFriends(first: Int): [Human]
                    // }
                    //
                    // type Droid implements Character {
                    //     name: String!
                    //     primaryFunction: String
                    //     friends(first: Int): [Character]
                    // }
                    mockHumanCharacterFriendsFunction = jest.fn();
                    unionTypeWeights = {
                        query: {
                            weight: 1,
                            fields: {
                                hero: {
                                    resolveTo: 'character',
                                },
                            },
                        },
                        character: {
                            weight: 1,
                            fields: {
                                name: {
                                    weight: 0,
                                },
                                friends: {
                                    resolveTo: 'character',
                                    weight: mockCharacterFriendsFunction,
                                },
                            },
                        },
                        human: {
                            weight: 1,
                            fields: {
                                name: { weight: 0 },
                                homePlanet: { weight: 0 },
                                friends: {
                                    resolveTo: 'character',
                                    weight: mockHumanCharacterFriendsFunction,
                                },
                                humanFriends: {
                                    resolveTo: 'human',
                                    weight: mockHumanFriendsFunction,
                                },
                            },
                        },
                        droid: {
                            weight: 1,
                            fields: {
                                name: { weight: 0 },
                                primaryFunction: { weight: 0 },
                                friends: {
                                    resolveTo: 'character',
                                    weight: mockDroidFriendsFunction,
                                },
                            },
                        },
                    };
                    variables = {};
                    queryParser = new ASTParser(unionTypeWeights, variables);
                });
                test('that have a complexity of zero', () => {
                    query = `
                        query {
                            hero(episode: EMPIRE) {
                                name
                                ... on Droid {
                                    primaryFunction
                                }
                                ... on Human {
                                    homePlanet
                                }
                            }
                        }`;
                    // Query 1 + 1 hero
                    expect(queryParser.processQuery(parse(query))).toBe(2);
                });

                test('that have differing complexities', () => {
                    query = `
                        query {
                            hero(episode: EMPIRE) {
                                name
                                ... on Droid {
                                    primaryFunction
                                    friends(first: 1) {
                                        name
                                    }
                                }
                                ... on Human {
                                    homePlanet
                                    friends(first: 3) {
                                        name
                                    }
                                }
                            }
                        }`;
                    // Query 1 + 1 hero + max(Droid 2, Human 3) = 5
                    mockHumanCharacterFriendsFunction.mockReturnValueOnce(3);
                    mockDroidFriendsFunction.mockReturnValueOnce(1);
                    expect(queryParser.processQuery(parse(query))).toBe(5);
                });

                test('that contain an object and a non-zero complexity', () => {
                    query = `
                        query {
                            hero(episode: EMPIRE) {
                                name
                                friends(first: 3) {
                                    name
                                }
                                ... on Droid {
                                    primaryFunction
                                }
                                ... on Human {
                                    homePlanet
                                }
                            }
                        }`;
                    mockCharacterFriendsFunction.mockReturnValueOnce(3);
                    variables = { first: 3 };
                    queryParser = new ASTParser(unionTypeWeights, variables);
                    // Query 1 + 1 hero + 3 friends/character
                    expect(queryParser.processQuery(parse(query))).toBe(5);
                });

                test('that use a variable', () => {
                    query = `
                        query {
                            hero(episode: EMPIRE) {
                                name
                                ... on Droid {
                                    primaryFunction
                                    friends(first: $first) {
                                        name
                                    }
                                }
                                ... on Human {
                                    homePlanet
                                }
                            }
                        }`;
                    mockDroidFriendsFunction.mockReturnValueOnce(3);
                    variables = { first: 3 };
                    queryParser = new ASTParser(unionTypeWeights, variables);
                    // Query 1 + 1 hero + max(Droid 3, Human 0) = 5
                    expect(queryParser.processQuery(parse(query))).toBe(5);
                });

                test('that do not have a TypeCondition', () => {
                    query = `
                        query {
                            hero(episode: EMPIRE) {
                                ... {
                                    name
                                    friends(first: 3) {
                                        name
                                    }
                                }
                                ... on Human {
                                    homePlanet
                                }
                            }
                        }`;
                    mockCharacterFriendsFunction.mockReturnValueOnce(3);
                    // Query 1 + 1 hero + max(Character 3, Human 0) = 5
                    expect(queryParser.processQuery(parse(query))).toBe(5);
                });

                test('that have greater than 2  levels of nesting', () => {
                    query = `
                    query {
                        hero(episode: EMPIRE) {
                            name
                            ... on Droid {
                                primaryFunction
                                friends(first: 5) {
                                    name
                                    friends(first: 3) {
                                        name
                                    }
                                }
                            }
                            ... on Human {
                                homePlanet
                                friends(first: 5) {
                                    name
                                    friends(first: 3) {
                                        name
                                    }
                                }
                            }
                        }
                    }`;
                    mockCharacterFriendsFunction.mockReturnValue(3);
                    mockDroidFriendsFunction.mockReturnValueOnce(20);
                    mockHumanFriendsFunction.mockReturnValueOnce(20);
                    // Query 1 + 1 hero + 3 friends/character
                    expect(queryParser.processQuery(parse(query))).toBe(22);
                });

                test('and multiple fragments apply to the selection set', () => {
                    query = `
                        query {
                            hero(episode: EMPIRE) {
                                ...@include(if: true) {
                                    name
                                    friends(first: 3) {
                                        name
                                    }
                                }
                                ... on Human {
                                    humanFriends(first: 2) {
                                        name
                                    }
                                }
                            }
                        }`;
                    mockCharacterFriendsFunction.mockReturnValueOnce(3);
                    mockHumanFriendsFunction.mockReturnValueOnce(2);
                    // Query 1 + 1 hero + ...Character 3 + ...Human 2 = 7
                    expect(queryParser.processQuery(parse(query))).toBe(7);
                });
            });

            describe('on interface types', () => {
                test('that have a complexity of zero', () => {
                    query = `
                        query {
                            hero(episode: EMPIRE) {
                                name
                                ... on Droid {
                                    primaryFunction
                                }
                                ... on Human {
                                    homePlanet
                                }
                            }
                        }`;
                    // Query 1 + 1 hero
                    expect(queryParser.processQuery(parse(query))).toBe(2);
                });

                test('that have differing complexities', () => {
                    query = `
                        query {
                            hero(episode: EMPIRE) {
                                name
                                ... on Droid {
                                    primaryFunction
                                    friends(first: 2) {
                                        name
                                    }
                                }
                                ... on Human {
                                    homePlanet
                                    friends(first: 3) {
                                        name
                                    }
                                }
                            }
                        }`;
                    // Query 1 + 1 hero + max(Droid 0, Human 3) = 5
                    mockHumanFriendsFunction.mockReturnValueOnce(3);
                    mockDroidFriendsFunction.mockReturnValueOnce(2);
                    expect(queryParser.processQuery(parse(query))).toBe(5);
                });

                test('that contain an object and a non-zero complexity', () => {
                    query = `
                        query {
                            hero(episode: EMPIRE) {
                                name
                                friends(first: 3) {
                                    name
                                }
                                ... on Droid {
                                    primaryFunction
                                }
                                ... on Human {
                                    homePlanet
                                }
                            }
                        }`;
                    mockCharacterFriendsFunction.mockReturnValueOnce(3);
                    // Query 1 + 1 hero + 3 friends/character
                    mockHumanFriendsFunction.mockReturnValueOnce(3);
                    expect(queryParser.processQuery(parse(query))).toBe(5);
                });

                test('that use a variable', () => {
                    query = `
                        query {
                            hero(episode: EMPIRE) {
                                name
                                ... on Droid {
                                    primaryFunction
                                    friends(first: $first) {
                                        name
                                    }
                                }
                                ... on Human {
                                    homePlanet
                                }
                            }
                        }`;
                    mockDroidFriendsFunction.mockReturnValueOnce(3);
                    variables = { first: 3 };
                    queryParser = new ASTParser(typeWeights, variables);
                    // Query 1 + 1 hero + max(Droid 3, Human 0) = 5
                    expect(queryParser.processQuery(parse(query))).toBe(5);
                });

                test('that do not have a TypeCondition', () => {
                    query = `
                        query {
                            hero(episode: EMPIRE) {
                                ... {
                                    name
                                    scalarList(first: 1)
                                    friends(first: 3) {
                                        name
                                    }
                                }
                                ... on Human {
                                    homePlanet
                                }
                            }
                        }`;
                    mockCharacterFriendsFunction.mockReturnValueOnce(3);
                    // Query 1 + 1 hero + max(Character 3, Human 0) = 5
                    expect(queryParser.processQuery(parse(query))).toBe(5);
                });

                test('and multiple fragments apply to the selection set', () => {
                    query = `
                        query {
                            hero(episode: EMPIRE) {
                                ...@include(if: true) {
                                    name
                                    friends(first: 3) {
                                        name
                                    }
                                }
                                ... on Human {
                                    humanFriends(first: 2) {
                                        name
                                    }
                                }
                            }
                        }`;
                    mockCharacterFriendsFunction.mockReturnValueOnce(3);
                    mockHumanFriendsFunction.mockReturnValueOnce(2);
                    // Query 1 + 1 hero + ...Character 3 + ...Human 2 = 7
                    expect(queryParser.processQuery(parse(query))).toBe(7);
                });
            });
        });

        test('with lists of unknown size and a custom @listCost directive is used', () => {
            query = `
            query { 
                search(text: "hi") { 
                    id
                    name
                }
            }`;
            expect(queryParser.processQuery(parse(query))).toBe(11);
        });

        test('with lists determined by arguments and variables', () => {
            query = `query {reviews(episode: EMPIRE, first: 3) { stars, commentary } }`;
            mockWeightFunction.mockReturnValueOnce(3);
            expect(queryParser.processQuery(parse(query))).toBe(4); // 1 Query + 3 reviews
            expect(mockWeightFunction.mock.calls.length).toBe(1);
            expect(mockWeightFunction.mock.calls[0].length).toBe(3); // calling  with arguments and variables

            variables = { first: 4 };
            queryParser = new ASTParser(typeWeights, variables);
            mockWeightFunction.mockReturnValueOnce(4);
            query = `query queryVariables($first: Int) {reviews(episode: EMPIRE, first: $first) { stars, commentary } }`;
            expect(queryParser.processQuery(parse(query))).toBe(5); // 1 Query + 4 reviews
            expect(mockWeightFunction.mock.calls.length).toBe(2);
            expect(mockWeightFunction.mock.calls[1].length).toBe(3); // calling  with arguments and variables
        });

        test('with bounded lists including non-null operators', () => {
            query = `query {nonNull(episode: EMPIRE, first: 3) { name, id } }`;
            nonNullMockWeightFunction.mockReturnValueOnce(3);
            expect(queryParser.processQuery(parse(query))).toBe(4); // 1 Query + 3 reviews
            expect(nonNullMockWeightFunction.mock.calls.length).toBe(1);
            expect(nonNullMockWeightFunction.mock.calls[0].length).toBe(3);
        });

        // TODO: refine complexity analysis to consider directives includes and skip
        describe('with directives @includes and @skip', () => {
            test('@includes on interfaces', () => {
                query = `
                    query {
                        hero(episode: EMPIRE) {
                            ...@include(if: true) {
                                name
                                friends(first: 3) {
                                    name
                                }
                            }
                            ... on Human {
                                homePlanet
                            }
                        }
                    }`;
                mockCharacterFriendsFunction.mockReturnValueOnce(3);
                // Query 1 + 1 hero + max(...Character 3, ...Human 0) = 5
                expect(queryParser.processQuery(parse(query))).toBe(5);

                query = `
                    query {
                        hero(episode: EMPIRE) {
                            ...@include(if: false) {
                                name
                                friends(first: 3) {
                                    name
                                }
                            }
                            ... on Human {
                                homePlanet
                            }
                        }
                    }`;
                mockCharacterFriendsFunction.mockReturnValueOnce(3);
                // Query 1 + 1 hero = 2
                expect(queryParser.processQuery(parse(query))).toBe(2);
            });

            test('@skip on interfaces', () => {
                query = `
                    query {
                        hero(episode: EMPIRE) {
                            ...@skip(if: true) {
                                name
                                friends(first: 3) {
                                    name
                                }
                            }
                            ... on Human {
                                homePlanet
                            }
                        }
                    }`;
                mockCharacterFriendsFunction.mockReturnValueOnce(3);
                // Query 1 + 1 hero = 2
                expect(queryParser.processQuery(parse(query))).toBe(2);

                query = `
                    query {
                        hero(episode: EMPIRE) {
                            ...@skip(if: false) {
                                name
                                friends(first: 3) {
                                    name
                                }
                            }
                            ... on Human {
                                homePlanet
                            }
                        }
                    }`;
                mockCharacterFriendsFunction.mockReturnValueOnce(3);
                // Query 1 + 1 hero + max(...Character 3, ...Human 0) = 5
                expect(queryParser.processQuery(parse(query))).toBe(5);
            });

            test('@includes on object types', () => {
                query = `query { 
                    hero(episode: EMPIRE) { 
                        id, name 
                    } 
                    human(id: 1) @include(if: true) { 
                        id, 
                        name, 
                        homePlanet 
                    } 
                }`;
                // 1 query + 1 hero + 1 human
                expect(queryParser.processQuery(parse(query))).toBe(3);

                query = `query { 
                    hero(episode: EMPIRE) { 
                        id, name 
                    } 
                    human(id: 1) @include(if: false) { 
                        id, 
                        name, 
                        homePlanet 
                    } 
                }`;
                // 1 query + 1 hero
                expect(queryParser.processQuery(parse(query))).toBe(2);
            });

            test('@skip on object types', () => {
                query = `query { 
                    hero(episode: EMPIRE) { 
                        id, name 
                    } 
                    human(id: 1) @skip(if: true) { 
                        id, 
                        name, 
                        homePlanet 
                    } 
                }`;
                // 1 query + 1 hero
                expect(queryParser.processQuery(parse(query))).toBe(2);

                query = `query { 
                    hero(episode: EMPIRE) { 
                        id, name 
                    } 
                    human(id: 1) @skip(if: false) { 
                        id, 
                        name, 
                        homePlanet 
                    } 
                }`;
                // 1 query + 1 hero + 1 human
                expect(queryParser.processQuery(parse(query))).toBe(3);
            });
            test('with arguments and varibales', () => {
                variables = { directive: false };
                queryParser = new ASTParser(typeWeights, variables);
                query = `query ($directive: Boolean!){ 
                    hero(episode: EMPIRE) { 
                        id, name 
                    } 
                    human(id: 1) @skip(if: $directive) { 
                        id, 
                        name, 
                        homePlanet 
                    } 
                }`;
                // 1 query + 1 hero + 1 human
                expect(queryParser.processQuery(parse(query))).toBe(3);
                variables = { directive: true };
                queryParser = new ASTParser(typeWeights, variables);
                query = `query ($directive: Boolean!){ 
                    hero(episode: EMPIRE) { 
                        id, name 
                    } 
                    human(id: 1) @includes(if: $directive) { 
                        id, 
                        name, 
                        homePlanet 
                    } 
                }`;
                // 1 query + 1 hero
                expect(queryParser.processQuery(parse(query))).toBe(2);
            });

            test('and other directive are ignored', () => {
                query = `query { 
                    hero(episode: EMPIRE) { 
                        id, name 
                    } 
                    human(id: 1) @ignore(if: true) { 
                        id, 
                        name, 
                        homePlanet 
                    } 
                }`;
                // 1 query + 1 hero + 1 human
                expect(queryParser.processQuery(parse(query))).toBe(3);
                query = `query { 
                    hero(episode: EMPIRE) { 
                        id, name 
                    } 
                    human(id: 1) @includes(when: false) { 
                        id, 
                        name, 
                        homePlanet 
                    } 
                }`;
                // 1 query + 1 hero
                expect(queryParser.processQuery(parse(query))).toBe(3);
            });
        });

        describe('with nested lists', () => {
            test('and simple nesting', () => {
                query = `query { human(id: 1) { name, friends(first: 5) { name, friends(first: 3){ name }}}} `;
                mockCharacterFriendsFunction.mockReturnValueOnce(3);
                mockHumanFriendsFunction.mockReturnValueOnce(20);
                expect(queryParser.processQuery(parse(query))).toBe(22); // 1 Query + 1 human/character +  (5 friends/character X (1 friend + 3 friends/characters))
                expect(mockCharacterFriendsFunction.mock.calls.length).toBe(1);
                expect(mockHumanFriendsFunction.mock.calls.length).toBe(1);
            });

            test('and inner scalar lists', () => {
                query = `
                query { human(id: 1) { name, friends(first: 5) { name, scalarList(first: 3)} }}`;
                mockHumanFriendsFunction.mockReturnValueOnce(5);
                expect(queryParser.processQuery(parse(query))).toBe(7); // 1 Query + 1 human/character + 5 friends/character + 0 scalarList
                expect(mockHumanFriendsFunction.mock.calls.length).toBe(1);
            });
        });

        test('accounting for __typename feild', () => {
            query = `
            query {
                hero{
                    __typename
                    ... on Human {
                        name
                        homePlanet
                    }
                    ... on Droid {
                        name
                        primaryFunction
                    }
                }
            }`;
            expect(queryParser.processQuery(parse(query))).toBe(2); // 1 Query + 1 hero/character
        });

        // TODO: create tests for an implementation of the connection pagination convention -- need soln for unbounded lists
        xdescribe('connection pagination convention', () => {});

        // TODO: directives @skip, @include and custom directives
    });

    describe('Calculates the correct type complexity for mutations', () => {
        test('simple mutation', () => {
            variables = { review: { stars: 5, commentary: 'good' } };
            query = `mutation createReviewMutation($review: ReviewInput!) { 
                createReview(episode: Empire, review: $review) {
                    stars
                    commentary
                    episode
                }
            }`;
            queryParser = new ASTParser(typeWeights, variables);
            expect(queryParser.processQuery(parse(query))).toBe(11); // Mutation 10 + review 1
        });

        test('mutation with no feilds queried', () => {
            variables = { review: { stars: 5, commentary: 'good' } };
            query = `mutation createReviewMutation($review: ReviewInput!) { 
                createReview(episode: Empire, review: $review) 
            }`;
            queryParser = new ASTParser(typeWeights, variables);
            expect(queryParser.processQuery(parse(query))).toBe(11); // Mutation 10 + review 1
        });

        test('mutation and query definitons', () => {
            variables = { review: { stars: 5, commentary: 'good' } };
            query = `mutation createReviewMutation($review: ReviewInput!) { 
                createReview(episode: Empire, review: $review) {
                    stars
                    commentary
                    episode
                }
            }
            
            query {
                hero(episode: EMPIRE) {
                    name
                }
            }`;
            queryParser = new ASTParser(typeWeights, variables);
            expect(queryParser.processQuery(parse(query))).toBe(13); // Mutation 10 + review 1 + query 1 + character 1
        });
    });

    describe('Calculates the depth of the query', () => {
        beforeEach(() => {
            queryParser = new ASTParser(typeWeights, {});
        });
        test('with one feild', () => {
            query = `query { scalars { num } }`;
            queryParser.processQuery(parse(query));
            expect(queryParser.maxDepth).toBe(2);
        });

        test('with multiple feilds of the same depth', () => {
            query = `query { 
                scalars { num } 
                character(id: 5) {name}
            }`;
            queryParser.processQuery(parse(query));
            expect(queryParser.maxDepth).toBe(2);
        });

        test('with multiple feilds of different depth', () => {
            query = `query { 
                scalars { num, test {name} } 
                character(id: 5) {name}
            }`;
            queryParser.processQuery(parse(query));
            expect(queryParser.maxDepth).toBe(3);
        });

        test('with simple nesting', () => {
            query = `query { human(id: 1) { name, friends(first: 5) { name, friends(first: 3){ name }}}} `;
            queryParser.processQuery(parse(query));
            expect(queryParser.maxDepth).toBe(4);
        });

        test('with fragments as the deepest part of the query', () => {
            query = `
            query {
                leftComparison: hero(episode: EMPIRE) {
                ...comparisonFields
                }
                rightComparison: hero(episode: JEDI) {
                ...comparisonFields
                }
            }
            
            fragment comparisonFields on Character {
                name
                appearsIn
                friends(first: 3) {
                    name
                }
            }`;
            queryParser.processQuery(parse(query));
            expect(queryParser.maxDepth).toBe(3);
        });

        test('with multiple fragments', () => {
            query = `
            query {
                leftComparison: hero(episode: EMPIRE) {
                ...comparisonFieldsLeft
                }
                rightComparison: hero(episode: JEDI) {
                ...comparisonFieldsRight
                }
            }
            
            fragment comparisonFieldsRight on Character {
                name
                appearsIn
                friends(first: 3) {
                    name
                }
            }
            fragment comparisonFieldsLeft on Character {
                name
                appearsIn
            }`;
            queryParser.processQuery(parse(query));
            expect(queryParser.maxDepth).toBe(3);
        });

        test('with fragments nested at the second level of the query', () => {
            query = `
            query {
                hero (episode: Episode) {
                    name,
                    leftComparison: friends (first: 2) {
                        ...comparisonFields
                    }
                    rightComparison: friends(first: 2) {
                        ...comparisonFields
                    }
                    
                }   
            }
            fragment comparisonFields on Character {
                name
                appearsIn
                friends (first: 3) {
                    name
                }
            }`;

            queryParser.processQuery(parse(query));
            expect(queryParser.maxDepth).toBe(4);
        });

        test('with inline fragments of differing depths', () => {
            query = `
            query {
                hero(episode: EMPIRE) {
                    name
                    ... on Droid {
                        primaryFunction
                        friends(first: 1) {
                            name
                        }
                    }
                    ... on Human {
                        homePlanet
                    }
                }
            }`;
            mockDroidFriendsFunction.mockReturnValueOnce(1);
            queryParser.processQuery(parse(query));
            expect(queryParser.maxDepth).toBe(3);
        });
    });

    xdescribe('Calculates the correct type complexity for subscriptions', () => {});
});
