import { GraphQLSchemaConfig } from 'graphql/type/schema';

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

function getTypeWeightsFromSchema(schema: GraphQLSchemaConfig): TypeWeightObject {
    throw Error(`getTypeWeightsFromSchema is not implemented.`);
}
export default getTypeWeightsFromSchema;
