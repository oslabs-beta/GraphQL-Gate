import { parse } from 'graphql';
import getQueryTypeComplexity from '../../src/analysis/typeComplexityAnalysis';

/** 
 * Here is the schema that creates the followning 'typeWeightsObject' used for the tests
 * 
    type Query {
        hero(episode: Episode): Character
        reviews(episode: Episode!, first: Int): [Review]
        search(text: String): [SearchResult]
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
        friends(first: Int): [Character]
        appearsIn: [Episode]!
    }

    type Human implements Character {
        id: ID!
        name: String!
        homePlanet: String
        friends(first: Int): [Character]
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
        variable: Scalars
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

// this object is created by the schema above for use in all the tests below
const typeWeights: TypeWeightObject = {
    query: {
        // object type
        weight: 1,
        fields: {
            // FIXME: update the function def that is supposed te be here to match implementation
            // FIXME: add the function definition for the 'search' field which returns a list
            reviews: (arg) => 1,
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
            id: 0,
            name: 0,
            // FIXME: add the function definition for the 'friends' field which returns a list
        },
    },
    human: {
        // implements an interface
        weight: 1,
        fields: {
            id: 0,
            name: 0,
            homePlanet: 0,
        },
    },
    droid: {
        // implements an interface
        weight: 1,
        fields: {
            id: 0,
            name: 0,
        },
    },
    review: {
        weight: 1,
        fields: {
            stars: 0,
            commentary: 0,
        },
    },
    searchResult: {
        // union type
        weight: 1,
        fields: {},
    },
    scalars: {
        weight: 1, // object weight is 1, all scalar feilds have weight 0
        fields: {
            num: 0,
            id: 0,
            float: 0,
            bool: 0,
            string: 0,
        },
    },
    test: {
        weight: 1,
        fields: {
            name: 0,
        },
    },
};

describe('Test getQueryTypeComplexity function', () => {
    let query = '';
    let variables: any | undefined;
    describe('Calculates the correct type complexity for queries', () => {
        test('with one feild', () => {
            query = `uery { scalars { num } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(2); // Query 1 + Scalars 1
        });

        test('with two or more fields', () => {
            query = `query { scalars { num } test { name } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(3); // Query 1 + scalars 1 + test 1
        });

        xtest('with one level of nested fields', () => {
            query = `query { scalars { num, test { name } } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(3); // Query 1 + scalars 1 + test 1
        });

        xtest('with multiple levels of nesting', () => {
            query = `query { scalars { num, test { name, scalars { id } } } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(4); // Query 1 + scalars 1 + test 1 + scalars 1
        });

        xtest('with aliases', () => {
            query = `query { foo: scalar { num } bar: scalar { id }}`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(3); // Query 1 + scalar 1 + scalar 1
        });

        xtest('with all scalar fields', () => {
            query = `query { scalars { id, num, float, bool, string } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(2); // Query 1 + scalar 1
        });

        xtest('with arguments and variables', () => {
            query = `query { hero(episode: EMPIRE) { id, name } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(2); // Query 1 + hero/character 1
            query = `query { human(id: 1) { id, name, appearsIn } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(3); // Query 1 + human/character 1 + appearsIn/episode
            // argument passed in as a variable
            variables = { ep: 'EMPIRE' };
            query = `query varibaleQuery ($ep: Episode){ hero(episode: $ep) { id, name } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(2); // Query 1 + hero/character 1
        });

        xtest('with fragments', () => {
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
              }
            }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(5); // Query 1 + 2*(character 1 + appearsIn/episode 1)
        });

        xtest('with inline fragments', () => {
            query = `
            query {
                hero(episode: EMPIRE) {
                    name
                    ... on Droid {
                        primaryFunction
                    }
                    ... on Human {
                        homeplanet
                    }
                }
            }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(2); // Query 1 + hero/character 1)
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

        xtest('with lists detrmined by arguments and variables', () => {
            query = `Query {reviews(episode: EMPIRE, first: 3) { stars, commentary } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(4); // 1 Query + 3 reviews
            variables = { first: 3 };
            query = `Query queryVaribales($first: Int) {reviews(episode: EMPIRE, first: $first) { stars, commentary } }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(4); // 1 Query + 3 reviews
        });

        xtest('with nested lists', () => {
            query = `
            query { 
                human(id: 1) { 
                    name, 
                    friends(first: 5) { 
                        name, 
                        friends(first: 3){ 
                            name 
                        } 
                    } 
                }
            }`;
            expect(getQueryTypeComplexity(parse(query), variables, typeWeights)).toBe(17); // 1 Query + 1 human/character +  (5 friends/character X 3 friends/characters)
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

        // todo: directives @skip, @include and custom directives

        // todo: expand on error handling
        xtest('Throws an error if for a bad query', () => {
            query = `query { hello { hi } }`; // type doesn't exist
            expect(() => getQueryTypeComplexity(parse(query), variables, typeWeights)).toThrow(
                'Error'
            );
            query = `query { hero(episode: EMPIRE){ starship } }`; // field doesn't exist
            expect(() => getQueryTypeComplexity(parse(query), variables, typeWeights)).toThrow(
                'Error'
            );
            query = `query { hero(episode: EMPIRE) { id, name }`; // missing a closing bracket
            expect(() => getQueryTypeComplexity(parse(query), variables, typeWeights)).toThrow(
                'Error'
            );
        });
    });

    xdescribe('Calculates the correct type complexity for mutations', () => {});

    xdescribe('Calculates the correct type complexity for subscriptions', () => {});
});
