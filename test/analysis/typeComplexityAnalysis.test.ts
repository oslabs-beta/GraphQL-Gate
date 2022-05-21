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
        stars: Int,
        body: String
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
};

describe('Test getQueryTypeComplexity function', () => {
    let query;
    describe('Calculates the correct type complexity for queries', () => {
        // with one feild
        test('with one feild', () => {
            query = `
            Query {

            }`;
        });
        // with two or more feilds
        // with one level of nested feilds
        // with multiple level of nesting

        // with arguments
        // with varibles and default varibales
        // with aliases
        // with inline fragments
        // with directives
        // meta feilds - __typename
        // with lists - worst case (ie. first 2) - are these called directives?
    });

    xdescribe('Calculates the correct type complexity for mutations', () => {});

    xdescribe('Calculates the correct type complexity for subscriptions', () => {});
});
