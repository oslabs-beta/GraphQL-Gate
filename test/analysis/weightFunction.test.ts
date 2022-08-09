import 'ts-jest';
import { buildSchema, DocumentNode, parse } from 'graphql';
import { TypeWeightObject } from '../../src/@types/buildTypeWeights';
import buildTypeWeightsFromSchema from '../../src/analysis/buildTypeWeights';
import ASTParser from '../../src/analysis/QueryParser';
// Test the weight function generated by the typeweights object when a limiting keyword is provided

// Test cases:
// Default value provided to schema
// Arg passed in as variable
// Arg passed in as scalar
// Invalid arg type provided

// Default value passed with query

describe('Weight Function correctly parses Argument Nodes if', () => {
    const schema = buildSchema(`
        type Query {
            reviews(episode: Episode!, first: Int = 5): [Review]
            heroes(episode: Episode!, first: Int): [Review]
            villains(episode: Episode!, limit: Int! = 3): [Review]! 
            characters(episode: Episode!, limit: Int!): [Review!]
            droids(episode: Episode!, limit: Int!): [Review!]!
            
        }
        type Review {
            episode: Episode
            stars: Int!
            commentary: String
            scalarList(last: Int): [Int]
            objectList(first: Int): [Object]
        }
        type Object {
            hi: String
        }
        enum Episode {
            NEWHOPE
            EMPIRE
            JEDI
        }`);
    // building the typeWeights object here since we're testing the weight function created in
    // the typeWeights object
    const typeWeights: TypeWeightObject = buildTypeWeightsFromSchema(schema);
    let queryParser: ASTParser;
    describe('a default value is provided in the schema', () => {
        beforeEach(() => {
            queryParser = new ASTParser(typeWeights, {});
        });
        test('and a value is not provided with the query', () => {
            const query = `query { reviews(episode: NEWHOPE) { stars, episode } }`;
            const queryAST: DocumentNode = parse(query);
            expect(queryParser.processQuery(queryAST)).toBe(6);
        });

        test('and a scalar value is provided with the query', () => {
            const query = `query { reviews(episode: NEWHOPE, first: 3) { stars, episode } }`;
            const queryAST: DocumentNode = parse(query);
            expect(queryParser.processQuery(queryAST)).toBe(4);
        });

        test('and the argument is passed in as a variable', () => {
            const query = `query variableQuery ($items: Int){ reviews(episode: NEWHOPE, first: $items) { stars, episode } }`;
            const queryAST: DocumentNode = parse(query);
            queryParser = new ASTParser(typeWeights, { items: 7, first: 4 });
            expect(queryParser.processQuery(queryAST)).toBe(8);
            queryParser = new ASTParser(typeWeights, { first: 4, items: 7 });
            expect(queryParser.processQuery(queryAST)).toBe(8);
        });
    });

    describe('a default value is not provided in the schema', () => {
        xtest('and a value is not provied with the query', () => {
            const query = `query { heroes(episode: NEWHOPE) { stars, episode } }`;
            const queryAST: DocumentNode = parse(query);
            // FIXME: Update expected result if unbounded lists are suppored
            expect(queryParser.processQuery(queryAST)).toBe(5);
        });

        test('and a scalar value is provided with the query', () => {
            const query = `query { heroes(episode: NEWHOPE, first: 3) { stars, episode } }`;
            const queryAST: DocumentNode = parse(query);
            expect(queryParser.processQuery(queryAST)).toBe(4);
        });

        test('and the argument is passed in as a variable', () => {
            const query = `query variableQuery ($items: Int){ heroes(episode: NEWHOPE, first: $items) { stars, episode } }`;
            const queryAST: DocumentNode = parse(query);
            queryParser = new ASTParser(typeWeights, { items: 7 });
            expect(queryParser.processQuery(queryAST)).toBe(8);
        });
    });

    test('the list is defined with non-null operators (!)', () => {
        const villainsQuery = `query { villains(episode: NEWHOPE, limit: 3) { stars, episode } }`;
        const villainsQueryAST: DocumentNode = parse(villainsQuery);
        expect(queryParser.processQuery(villainsQueryAST)).toBe(4);

        const charQuery = `query { characters(episode: NEWHOPE, limit: 3) { stars, episode } }`;
        const charQueryAST: DocumentNode = parse(charQuery);
        expect(queryParser.processQuery(charQueryAST)).toBe(4);

        const droidsQuery = `query droidsQuery { droids(episode: NEWHOPE, limit: 3) { stars, episode } }`;
        const droidsQueryAST: DocumentNode = parse(droidsQuery);
        expect(queryParser.processQuery(droidsQueryAST)).toBe(4);
    });

    test('a custom object weight was configured', () => {
        const customTypeWeights: TypeWeightObject = buildTypeWeightsFromSchema(schema, {
            object: 3,
        });
        queryParser = new ASTParser(customTypeWeights, {});
        const query = `query { heroes(episode: NEWHOPE, first: 3) { stars, episode } }`;
        const queryAST: DocumentNode = parse(query);
        expect(queryParser.processQuery(queryAST)).toBe(10);
    });

    test('a custom object weight was set to 0', () => {
        const customTypeWeights: TypeWeightObject = buildTypeWeightsFromSchema(schema, {
            object: 0,
        });
        queryParser = new ASTParser(customTypeWeights, {});
        const query = `query { heroes(episode: NEWHOPE, first: 3) { stars, episode } }`;
        const queryAST: DocumentNode = parse(query);
        expect(queryParser.processQuery(queryAST)).toBe(1); // 1 query
    });
    test('a custom scalar weight was set to greater than 0', () => {
        const customTypeWeights: TypeWeightObject = buildTypeWeightsFromSchema(schema, {
            scalar: 2,
        });
        queryParser = new ASTParser(customTypeWeights, {});
        const query = `query { heroes(episode: NEWHOPE, first: 3) { stars, episode } }`;
        const queryAST: DocumentNode = parse(query);
        expect(queryParser.processQuery(queryAST)).toBe(16);
    });

    test('variable names matching limiting keywords do not interfere with scalar argument values', () => {
        const query = `query variableQuery ($items: Int){ heroes(episode: NEWHOPE, first: 3) { stars, episode } }`;
        const queryAST: DocumentNode = parse(query);
        queryParser = new ASTParser(typeWeights, { first: 7 });
        expect(queryParser.processQuery(queryAST)).toBe(4);
    });

    test('nested queries with lists', () => {
        const query = `query { reviews(episode: NEWHOPE, first: 2) {stars, objectList(first: 3) {hi}}} `;
        expect(queryParser.processQuery(parse(query))).toBe(9); // 1 Query + 2 review + (2 *  3 objects)
    });

    test('queries with inner scalar lists', () => {
        const query = `query { reviews(episode: NEWHOPE, first: 2) {stars, scalarList(last: 3) }}`;
        expect(queryParser.processQuery(parse(query))).toBe(3); // 1 Query + 2 reviews
    });

    test('queries with inner scalar lists and custom scalar weight greater than 0', () => {
        const customTypeWeights: TypeWeightObject = buildTypeWeightsFromSchema(schema, {
            scalar: 2,
        });
        queryParser = new ASTParser(customTypeWeights, {});
        const query = `query { reviews(episode: NEWHOPE, first: 2) {stars, scalarList(last: 3) }}`;
        expect(queryParser.processQuery(parse(query))).toBe(19); // 1 Query + 2 reviews + 2 * (2 stars + (3 * 2 scalarList)
    });

    xtest('an invalid arg type is provided', () => {
        const query = `query { heroes(episode: NEWHOPE, first = 3) { stars, episode } }`;
        const queryAST: DocumentNode = parse(query);
        // FIXME: What is the expected behavior? Treat as unbounded?
        fail('test not implemented');
    });
});
