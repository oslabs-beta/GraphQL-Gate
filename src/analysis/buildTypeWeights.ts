import { GraphQLSchema } from 'graphql/type/schema';

interface Fields {
    [index: string]: number;
}

interface Type {
    weight: number;
    feilds: Fields;
}

interface TypeWeightObject {
    [index: string]: Type;
}

function buildTypeWeightsFromSchema(schema: GraphQLSchema): TypeWeightObject {
    throw Error(`getTypeWeightsFromSchema is not implemented.`);
}
export default buildTypeWeightsFromSchema;
