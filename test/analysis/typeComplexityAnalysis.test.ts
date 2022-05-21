import getQueryTypeComplxity from '../../src/analysis/typeComplexityAnalysis';

/** 
 * Here is the schema that creates the  followning typeWeightsObject used for the tests
 * 
 * TODO: extend this schema to include mutations, subscriptions, and other artifacts fonud in a schema

    type Query {
        actor: Actor
        movie: Movie
        review: Review
    }
    
    type Actor {
        name: String
        email: String
        films: [Movie]
    }
    
    type Movie {
        name: String
        star: Actor
        actors: [Actor]
        reviews: [Review]
    }           

    type Review {
        reviewer: Actor
        stars: Int,
        body: String
    }

    type Scalars {
        num: Int,
        id: ID,
        float: Float,
        bool: Boolean,
        string: String
    }
*/
const typeWeights: TypeWeightObject = {
    Query: {
        weight: 1,
        fields: {},
    },
    Actor: {
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
    Review: {
        weight: 1,
        fields: {
            stars: 0,
            body: 0,
        },
    },
    Scalars: {
        weight: 1,
        fields: {
            num: 0,
            id: 0,
            float: 0,
            bool: 0,
            string: 0,
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
            query = `Query { Actor { name } }`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(2); // Query 1 + Actor 1
        });

        test('with two or more fields', () => {
            query = `Query { actor { name } movie { name } }`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(3); // Query 1 + Actor 1 + Movie 1
            query = `Query { actor { name } movie { name } review { body } }`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(4); // Query 1 + Actor 1 + Movie 1 + Review 1
        });

        test('with one level of nested fields', () => {
            query = `Query { actor { name, movie { name } } }`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(3); // Query 1 + Actor 1 + Movie 1
        });

        test('with multiple levels of nesting', () => {
            query = `Query { actor { name, movie { name, review { body } } } }`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(4); // Query 1 + Actor 1 + Movie 1 + 1 Review
        });

        test('with aliases', () => {
            query = `Query { movie-name: movie { name } }`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(2); // Query 1 + movie
        });

        test('with all scalar fields', () => {
            query = `Query { scalars { id, num, float, bool, string } }`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(42); // Query 1 + movie
        });

        test('with arguments', () => {
            query = `Query { movie(episode: EMPIRE) { name, } }`;
            expect(getQueryTypeComplxity(query, typeWeights)).toBe(42); // Query 1 + movie
        });
        // with varibles and default varibales
        // with inline fragments
        // with directives
        // meta feilds - __typename
        // with lists - worst case (ie. first 2) - are these called directives?
    });

    xdescribe('Calculates the correct type complexity for mutations', () => {});

    xdescribe('Calculates the correct type complexity for subscriptions', () => {});
});
