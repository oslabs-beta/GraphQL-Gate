import { GraphQLSchema } from 'graphql/type/schema';

/**
 * The default type weights object is based off of Shopifys implewentation of query
 * cost analysis. Our function should input a users configuration of type weights or fall
 * back on shopifys on
 */
function buildTypeWeightsFromSchema(
    schema: GraphQLSchema,
    typeWeightsConfig: TypeWeightConfig = {
        query: 1,
        mutation: 10,
        object: 1,
        scalar: 0,
        connection: 2,
    }
): TypeWeightObject {
    throw Error(`getTypeWeightsFromSchema is not implemented.`);
}
export default buildTypeWeightsFromSchema;
