import { GraphQLSchema } from 'graphql/type/schema';

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
 * @param typeWeightsConfig
 */
function buildTypeWeightsFromSchema(
    schema: GraphQLSchema,
    typeWeightsConfig: TypeWeightConfig = {
        mutation: 10, // mutation
        object: 1, // itnterfaces, unions, objects, query
        scalar: 0, // enums, scalars
        connection: 2, // pagination stuff
        // ? subscription
    }
): TypeWeightObject {
    throw Error(`getTypeWeightsFromSchema is not implemented.`);
}
export default buildTypeWeightsFromSchema;
