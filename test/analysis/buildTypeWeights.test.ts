import { buildSchema } from 'graphql';
import { GraphQLSchema } from 'graphql/type/schema';
import buildTypeWeightsFromSchema from '../../src/analysis/buildTypeWeights';

describe('Test buildTypeWeightsFromSchema function', () => {
    beforeEach(() => {
        let schema: GraphQLSchema;
    });

    describe('query types', () => {
        // cretes type weight object from schema with multipl types
        test('creates the type weight object from graphql schema object', () => {});

        // creates tyep weight object from schema with nested types
        test('');
    });

    /**
     * Above tests are for query types only
     * todo testing functionality for mutations, pagination, lists, etc. is not yet implemented
     */
});
