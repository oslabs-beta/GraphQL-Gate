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

function parseSchemaObject(schema: GraphQLSchemaConfig): TypeWeightObject {}

export default parseSchemaObject;
