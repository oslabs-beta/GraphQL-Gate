import { GraphQLSchema } from 'graphql/type/schema';

/**
 * Default TypeWeight Configuration:
 * mutation: 10
 * object: 1
 * scalar: 0
 * connection: 2
 */
export const defaultTypeWeightsConfig: TypeWeightConfig = {
    mutation: 10,
    object: 1,
    scalar: 0,
    connection: 2,
};

/**
 * The default typeWeightsConfig object is based off of Shopifys implementation of query
 * cost analysis. Our function should input a users configuration of type weights or fall
 * back on shopifys settings. We can change this later.
 *
 * This function should
 *  - itreate through the schema object and create the typeWeightObject as described in the tests
 *  - validate that the typeWeightsConfig parameter has no negative values (throw an error if it does)
 *
 * @param schema
 * @param typeWeightsConfig Defaults to {mutation: 10, object: 1, field: 0, connection: 2}
 */
function buildTypeWeightsFromSchema(
    schema: GraphQLSchema,
    typeWeightsConfig: TypeWeightConfig = defaultTypeWeightsConfig
): TypeWeightObject {
    throw Error(`getTypeWeightsFromSchema is not implemented.`);
}
export default buildTypeWeightsFromSchema;
