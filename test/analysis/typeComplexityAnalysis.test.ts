import getQueryTypeComplxity from '../../src/analysis/typeComplexityAnalysis';

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
    type Topic {
        relatedTopics(first: Int): [Topic] 
        name: String
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
        fields: {},
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
    describe('Calculates the correct type complexity for queries', () => {
        beforeEach(() => {
            query = '';
        });

        test('with one feild', () => {
            query = `Query { scalars { num } }`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(2); // Query 1 + Scalars 1
        });

        test('with two or more fields', () => {
            query = `Query { scalars { num } test { name } }`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(3); // Query 1 + scalars 1 + test 1
        });

        test('with one level of nested fields', () => {
            query = `Query { scalars { num, test { name } } }`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(3); // Query 1 + scalars 1 + test 1
        });

        test('with multiple levels of nesting', () => {
            query = `Query { scalars { num, test { name, scalars { id } } } }`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(4); // Query 1 + scalars 1 + test 1 + scalars 1
        });

        test('with aliases', () => {
            query = `Query { foo: scalar { num } bar: scalar { id }}`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(3); // Query 1 + scalar 1 + scalar 1
        });

        test('with all scalar fields', () => {
            query = `Query { scalars { id, num, float, bool, string } }`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(2); // Query 1 + scalar 1
        });

        // todo
        test('with __typename treated as a  scalar', () => {});

        test('with arguments and variables', () => {
            query = `Query { hero(episode: EMPIRE) { id, name } }`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(2); // Query 1 + hero/character 1
            query = `Query { human(id: 1) { id, name, appearsIn } }`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(3); // Query 1 + human/character 1 + appearsIn/episode
            // argument passed in as a variable
            query = `Query { hero(episode: $ep) { id, name } }`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(2); // Query 1 + hero/character 1
        });

        test('with fragments', () => {
            query = `
            Query {
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
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(5); // Query 1 + 2*(character 1 + appearsIn/episode 1)
        });

        test('with inline fragments', () => {
            query = `
            Query {
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
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(2); // Query 1 + hero/character 1)
        });

        /**
         *
         * With type complexity analysis, all objects returned count towards the total complexity.
         * For example, the cost of querying for 5 friends is 5. I do not have any clue how we would know
         * to look for the argument 'first' to know, before running the query, how many objects are expected to be returned.
         *
         * Anouther example, if we queried the 'Search' type with some string argument, the returned number of objects
         * could be very large. Our algorithm will need to know what limit is set for the returned data (limit 100 search results
         * for example) and then account for that response to caculate the complexity. That information is in the resolvers. We
         * have no access to the resolvers.
         *
         * Some user configuration will be needed unless someone has bright ideas.
         */
        // ? type weigts are variable, not sure how to calculate this.
        test('with lists', () => {
            query = `
            Query { 
                human(id: 1) { 
                    name, 
                    friends(first: 5) { 
                        name 
                    } 
                }
            }`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(7); // 1 Query + 1 human/character +  5 friends/character
            query = `Query {reviews(episode: EMPIRE, first: 3) { stars, commentary } }`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(4); // 1 Query + 3 reviews
        });

        test('with nested lists', () => {
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
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(17); // 1 Query + 1 human/character +  (5 friends/character X 3 friends/characters)
        });

        test('accounting for __typename feild', () => {
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
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(5); // 1 Query + 4 search results
        });

        // todo
        // look into error handling for graphql. The only error I forsee is if the query is invalid in
        // which case we want to pass the query along to the graphQL server to handle. What would that look like here?
        xtest('Throws an error if for a bad query', () => {});

        // todo: directives @skip, @include and custom directives
    });

    xdescribe('Calculates the correct type complexity for mutations', () => {});

    xdescribe('Calculates the correct type complexity for subscriptions', () => {});
});
