import {
    GraphQLArgument,
    GraphQLEnumType,
    GraphQLFieldMap,
    GraphQLInterfaceType,
    GraphQLList,
    GraphQLNamedType,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLOutputType,
    GraphQLScalarType,
    GraphQLUnionType,
    isCompositeType,
} from 'graphql';
import { Maybe } from 'graphql/jsutils/Maybe';
import { GraphQLSchema } from 'graphql/type/schema';

const KEYWORDS = ['first', 'last', 'limit'];

/**
 * Default TypeWeight Configuration:
 * mutation: 10
 * object: 1
 * scalar: 0
 * connection: 2
 */
const DEFAULT_MUTATION_WEIGHT = 10;
const DEFAULT_OBJECT_WEIGHT = 1;
const DEFAULT_SCALAR_WEIGHT = 0;
const DEFAULT_CONNECTION_WEIGHT = 2;
const DEFAULT_QUERY_WEIGHT = 1;

export const defaultTypeWeightsConfig: TypeWeightConfig = {
    mutation: DEFAULT_MUTATION_WEIGHT,
    object: DEFAULT_OBJECT_WEIGHT,
    scalar: DEFAULT_SCALAR_WEIGHT,
    connection: DEFAULT_CONNECTION_WEIGHT,
};

/**
 * The default typeWeightsConfig object is based off of Shopifys implementation of query
 * cost analysis. Our function should input a users configuration of type weights or fall
 * back on shopifys settings. We can change this later.
 *
 * This function should
 *  - TODO: iterate through the schema object and create the typeWeightObject as described in the tests
 *  - TODO: validate that the typeWeightsConfig parameter has no negative values (throw an error if it does)
 *
 * @param schema
 * @param typeWeightsConfig Defaults to {mutation: 10, object: 1, field: 0, connection: 2}
 */
function buildTypeWeightsFromSchema(
    schema: GraphQLSchema,
    typeWeightsConfig: TypeWeightConfig = defaultTypeWeightsConfig
): TypeWeightObject {
    // Iterate each key in the schema object
    // this includes scalars, types, interfaces, unions, enums etc.
    // check the type of each add set the appropriate weight.
    // iterate through that types fields and set the appropriate weight
    // this is kind of only relevant for things like Query or Mutation
    // that have functions(?) as fields for which we should set the weight as a function
    // that take any required params.

    if (!schema) throw new Error('Must provide schema');

    //  Merge the provided type weights with the default to account for missing values
    const typeWeights: TypeWeightConfig = {
        ...defaultTypeWeightsConfig,
        ...typeWeightsConfig,
    };

    // Confirm that any custom weights are positive
    Object.entries(typeWeights).forEach((value: [string, number]) => {
        if (value[1] < 0) {
            throw new Error(`Type weights cannot be negative. Received: ${value[0]}: ${value[1]} `);
        }
    });

    const result: TypeWeightObject = {};

    // Iterate through __typeMap and set weights of all object types?

    const typeMap = schema.getTypeMap();

    Object.keys(typeMap).forEach((type) => {
        const currentType: GraphQLNamedType = typeMap[type];
        // Limit to object types for now
        // Get all types that aren't Query or Mutation and don't start with __
        if (
            currentType.name !== 'Query' &&
            currentType.name !== 'Mutation' &&
            !currentType.name.startsWith('__')
        ) {
            if (
                currentType instanceof GraphQLObjectType ||
                currentType instanceof GraphQLInterfaceType
            ) {
                // Add the type to the result
                result[type] = {
                    fields: {},
                    weight: typeWeights.object || DEFAULT_OBJECT_WEIGHT,
                };

                const fields = currentType.getFields();
                Object.keys(fields).forEach((field: string) => {
                    const fieldType: GraphQLOutputType = fields[field].type;
                    if (
                        fieldType instanceof GraphQLScalarType ||
                        (fieldType instanceof GraphQLNonNull &&
                            fieldType.ofType instanceof GraphQLScalarType)
                    ) {
                        result[type].fields[field] = typeWeights.scalar || DEFAULT_SCALAR_WEIGHT;
                    }
                    // FIXME: Do any other types need to be included?
                });
            } else if (currentType instanceof GraphQLEnumType) {
                result[currentType.name] = {
                    fields: {},
                    weight: 0,
                };
            } else if (currentType instanceof GraphQLUnionType) {
                result[currentType.name] = {
                    fields: {},
                    weight: 1, // FIXME: Use the correct weight
                };
            }
        }
    });

    // Get any Query fields (these are the queries that the API exposes)
    const queryType: Maybe<GraphQLObjectType> = schema.getQueryType();

    if (queryType) {
        result.Query = {
            weight: typeWeights.query || DEFAULT_QUERY_WEIGHT,
            fields: {
                // This object gets populated with the query fields and associated weights.
            },
        };
        const queryFields: GraphQLFieldMap<any, any> = queryType.getFields();
        Object.keys(queryFields).forEach((field) => {
            const resolveType: GraphQLOutputType = queryFields[field].type;

            queryFields[field].args.forEach((arg: GraphQLArgument) => {
                // check if any of our keywords 'first', 'last', 'limit' exist in the arglist
                if (KEYWORDS.includes(arg.name) && resolveType instanceof GraphQLList) {
                    const defaultVal: number = <number>arg.defaultValue;
                    // FIXME: How can we provide the complexity analysis algo with name of the argument to use?
                    const listType = resolveType.ofType;
                    if (isCompositeType(listType)) {
                        result.Query.fields[field] = (multiplier: number = defaultVal) =>
                            multiplier * result[listType.name].weight;
                    }
                }
            });

            // if the field is a scalars set weight accordingly
            // FIXME: Enums shouldn't be here???
            if (
                resolveType instanceof GraphQLScalarType ||
                resolveType instanceof GraphQLEnumType
            ) {
                result.Query.fields[field] = typeWeights.scalar || DEFAULT_SCALAR_WEIGHT;
            }
        });
    }

    // get the type of the field

    return result;
}
export default buildTypeWeightsFromSchema;
