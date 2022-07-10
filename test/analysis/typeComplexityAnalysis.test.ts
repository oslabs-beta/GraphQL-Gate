import { parse } from 'graphql';
import getQueryTypeComplexity from '../../src/analysis/typeComplexityAnalysis';
import { TypeWeightObject, Variables } from '../../src/@types/buildTypeWeights';

/** 
 * Here is the schema that creates the followning 'typeWeightsObject' used for the tests
 * 
    type Query {
        hero(episode: Episode): Character
        heroUnion(episode: Episode): SearchResult
        reviews(episode: Episode!, first: Int): [Review]
        search(text: String): [SearchResult]
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

 *   
 * TODO: extend this schema to include mutations, subscriptions and pagination
 * 
    type Mutation {
        createReview(episode: Episode, review: ReviewInput!): Review
    }
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
                        weight: jest.fn(), // FIXME: Unbounded list result
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
                fields: {},
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
        test('with one feild', () => {
            query = `query { scalars { num } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(2); // Query 1 + Scalars 1
        });

        xtest('with one with capital first letter for field', () => {
            query = `query { Scalars { num } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(2); // Query 1 + Scalars 1
        });

        test('with two or more fields', () => {
            query = `query { scalars { num } test { name } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(3); // Query 1 + scalars 1 + test 1
        });

        test('with one level of nested fields', () => {
            query = `query { scalars { num, test { name } } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(3); // Query 1 + scalars 1 + test 1
        });

        test('with multiple levels of nesting', () => {
            query = `query { scalars { num, test { name, scalars { id } } } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(4); // Query 1 + scalars 1 + test 1 + scalars 1
        });

        test('with aliases', () => {
            query = `query { foo: scalars { num } bar: scalars { id }}`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(3); // Query 1 + scalar 1 + scalar 1
        });

        test('with all scalar fields', () => {
            query = `query { scalars { id, num, float, bool, string } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(2); // Query 1 + scalar 1
        });

        test('with arguments and variables', () => {
            query = `query { hero(episode: EMPIRE) { id, name } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(2); // Query 1 + hero/character 1
            query = `query { human(id: 1) { id, name, homePlanet } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(2); // Query 1 + human/character 1
            // argument passed in as a variable
            variables = { ep: 'EMPIRE' };
            query = `query variableQuery ($ep: Episode){ hero(episode: $ep) { id, name } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(2); // Query 1 + hero/character 1
        });

        xdescribe('with fragments', () => {
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
                expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(3);
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
                // Query 1 + 2*(character 1 + appearsIn/episode 0 + 3 * friends/character 1)
                expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(9);
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
                // Query 1 + 2*(character 1 + appearsIn/episode 0 + 3 * friends/character 1)
                expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(9);
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
                // Query 1 + 2*(character 1 + appearsIn/episode 0 + 3 * friends/character 1)
                expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(9);

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
                // Query 1 + 2*(character 1 + 0 selectionCost)
                expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(3);
            });
        });

        xdescribe('with inline fragments', () => {
            describe('on union types', () => {
                beforeAll(() => {
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
                    typeWeights = {
                        query: {
                            weight: 1,
                            fields: {
                                hero: {
                                    resolveTo: 'character',
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
                                    weight: mockCharacterFriendsFunction,
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
                    expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(2);
                });

                test('that have differing complexities', () => {
                    query = `
                        query {
                            hero(episode: EMPIRE) {
                                name
                                ... on Droid {
                                    primaryFunction
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
                    expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(5);
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
                    // Query 1 + 1 hero + 3 friends/character
                    expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(5);
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
                    // Query 1 + 1 hero + max(Droid 3, Human 0) = 5
                    expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(5);
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
                    expect(getQueryTypeComplexity(parse(query), {}, typeWeights)).toBe(5);
                });

                xtest('that include a directive', () => {
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
                    expect(getQueryTypeComplexity(parse(query), {}, typeWeights)).toBe(5);
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
                    expect(getQueryTypeComplexity(parse(query), {}, typeWeights)).toBe(7);
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
                    expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(2);
                });

                test('that have differing complexities', () => {
                    query = `
                        query {
                            hero(episode: EMPIRE) {
                                name
                                ... on Droid {
                                    primaryFunction
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
                    expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(5);
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
                    expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(5);
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
                    // Query 1 + 1 hero + max(Droid 3, Human 0) = 5
                    expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(5);
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
                    expect(getQueryTypeComplexity(parse(query), {}, typeWeights)).toBe(5);
                });

                xtest('that include a directive', () => {
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
                    expect(getQueryTypeComplexity(parse(query), {}, typeWeights)).toBe(5);
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
                    expect(getQueryTypeComplexity(parse(query), {}, typeWeights)).toBe(7);
                });
            });
        });

        /**
         * FIXME: handle lists of unknown size. change the expected result Once we figure out the implementation.
         */
        xtest('with lists of unknown size', () => {
            query = `
            query { 
                search(text: 'hi') { 
                    id
                    name
                }
            }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(false); // ?
        });

        test('with lists determined by arguments and variables', () => {
            query = `query {reviews(episode: EMPIRE, first: 3) { stars, commentary } }`;
            mockWeightFunction.mockReturnValueOnce(3);
            expect(getQueryTypeComplexity(parse(query), {}, typeWeights)).toBe(4); // 1 Query + 3 reviews
            expect(mockWeightFunction.mock.calls.length).toBe(1);
            expect(mockWeightFunction.mock.calls[0].length).toBe(3); // calling  with arguments and variables

            variables = { first: 4 };
            mockWeightFunction.mockReturnValueOnce(4);
            query = `query queryVariables($first: Int) {reviews(episode: EMPIRE, first: $first) { stars, commentary } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(5); // 1 Query + 4 reviews
            expect(mockWeightFunction.mock.calls.length).toBe(2);
            expect(mockWeightFunction.mock.calls[1].length).toBe(3); // calling  with arguments and variables
        });

        test('with bounded lists including non-null operators', () => {
            query = `query {nonNull(episode: EMPIRE, first: 3) { name, id } }`;
            nonNullMockWeightFunction.mockReturnValueOnce(3);
            expect(getQueryTypeComplexity(parse(query), {}, typeWeights)).toBe(4); // 1 Query + 3 reviews
            expect(nonNullMockWeightFunction.mock.calls.length).toBe(1);
            expect(nonNullMockWeightFunction.mock.calls[0].length).toBe(3);
        });

        describe('with nested lists', () => {
            test('and simple nesting', () => {
                query = `query { human(id: 1) { name, friends(first: 5) { name, friends(first: 3){ name }}}} `;
                mockCharacterFriendsFunction.mockReturnValueOnce(3);
                mockHumanFriendsFunction.mockReturnValueOnce(20);
                expect(getQueryTypeComplexity(parse(query), {}, typeWeights)).toBe(22); // 1 Query + 1 human/character +  (5 friends/character X (1 friend + 3 friends/characters))
                expect(mockCharacterFriendsFunction.mock.calls.length).toBe(1);
                expect(mockHumanFriendsFunction.mock.calls.length).toBe(1);
            });

            test('and inner scalar lists', () => {
                query = `
                query { human(id: 1) { name, friends(first: 5) { name, scalarList(first: 3)} }}`;
                mockHumanFriendsFunction.mockReturnValueOnce(5);
                expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(7); // 1 Query + 1 human/character + 5 friends/character + 0 scalarList
                expect(mockHumanFriendsFunction.mock.calls.length).toBe(1);
            });
        });

        xtest('accounting for __typename feild', () => {
            query = `
            query {
                search(text: "an", first: 4) {
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
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(5); // 1 Query + 4 search results
        });

        // TODO: directives @skip, @include and custom directives
    });

    xdescribe('Calculates the correct type complexity for mutations', () => {});

    xdescribe('Calculates the correct type complexity for subscriptions', () => {});
});
