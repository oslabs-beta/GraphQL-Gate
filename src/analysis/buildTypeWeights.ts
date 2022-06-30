import {
    ArgumentNode,
    GraphQLArgument,
    GraphQLFieldMap,
    GraphQLNamedType,
    GraphQLObjectType,
    GraphQLOutputType,
    isCompositeType,
    isEnumType,
    isInterfaceType,
    isListType,
    isNonNullType,
    isObjectType,
    isScalarType,
    isUnionType,
    Kind,
    ValueNode,
} from 'graphql';
import { Maybe } from 'graphql/jsutils/Maybe';
import { ObjMap } from 'graphql/jsutils/ObjMap';
import { GraphQLSchema } from 'graphql/type/schema';
import { TypeWeightConfig, TypeWeightObject } from '../@types/buildTypeWeights';

export const KEYWORDS = ['first', 'last', 'limit'];

// These variables exist to provide a default value for typescript when accessing a weight
// since all props are optioal in TypeWeightConfig
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

// FIXME: What about Interface defaults

/**
 * Parses the Query type in the provided schema object and outputs a new TypeWeightObject
 * @param schema
 * @param typeWeightObject
 * @param typeWeights
 * @returns
 */
function parseQuery(
    schema: GraphQLSchema,
    typeWeightObject: TypeWeightObject,
    typeWeights: TypeWeightConfig
): TypeWeightObject {
    // Get any Query fields (these are the queries that the API exposes)
    const queryType: Maybe<GraphQLObjectType> = schema.getQueryType();

    if (!queryType) return typeWeightObject;

    const result: TypeWeightObject = { ...typeWeightObject };

    result.query = {
        weight: typeWeights.query || DEFAULT_QUERY_WEIGHT,
        // fields gets populated with the query fields and associated weights.
        fields: {},
    };

    const queryFields: GraphQLFieldMap<any, any> = queryType.getFields();

    Object.keys(queryFields).forEach((field) => {
        // this is the type the query resolves to
        const resolveType: GraphQLOutputType = queryFields[field].type;

        // check if any of our keywords 'first', 'last', 'limit' exist in the arg list
        queryFields[field].args.forEach((arg: GraphQLArgument) => {
            // If query has an argument matching one of the limiting keywords and resolves to a list then the weight of the query
            // should be dependent on both the weight of the resolved type and the limiting argument.
            // FIXME: Can nonnull wrap list types?
            if (KEYWORDS.includes(arg.name) && isListType(resolveType)) {
                // Get the type that comprises the list
                const listType = resolveType.ofType;

                // FIXME: This function can only handle integer arguments for one of the keyword params.
                // In order to handle variable arguments, we may need to accept a second parameter so that the complexity aglorithm
                // can pass in the variables as well.
                // FIXME: If the weight of the resolveType is 0 the weight can be set to 0 rather than a function.
                result.query.fields[field] = (args: ArgumentNode[]): number => {
                    // TODO: Test this function
                    const limitArg: ArgumentNode | undefined = args.find(
                        (cur) => cur.name.value === arg.name
                    );

                    if (limitArg) {
                        const node: ValueNode = limitArg.value;

                        if (Kind.INT === node.kind) {
                            const multiplier = Number(node.value || arg.defaultValue);
                            const weight = isCompositeType(listType)
                                ? result[listType.name.toLowerCase()].weight
                                : typeWeights.scalar || DEFAULT_SCALAR_WEIGHT; // Note this includes enums

                            return weight * multiplier;
                        }

                        if (Kind.VARIABLE === node.kind) {
                            // TODO: Get variable value and return
                            // const multiplier: number =
                            // return result[listType.name.toLowerCase()].weight * multiplier;
                            throw new Error(
                                'ERROR: buildTypeWeights Variable arge values not supported;'
                            );
                        }
                    }

                    // FIXME: The list is unbounded. Return the object weight for
                    throw new Error(
                        `ERROR: buildTypeWeights: Unbouned list complexity not supported. Query results should be limited with ${KEYWORDS}`
                    );
                };
            }
        });

        // if the field is a scalar or an enum set weight accordingly. It is not a list in this case
        if (isScalarType(resolveType) || isEnumType(resolveType)) {
            result.query.fields[field] = typeWeights.scalar || DEFAULT_SCALAR_WEIGHT;
        }
    });
    return result;
}

/**
 * Parses all types in the provided schema object excempt for Query, Mutation
 * and built in types that begin with '__' and outputs a new TypeWeightObject
 * @param schema
 * @param typeWeightObject
 * @param typeWeights
 * @returns
 */
function parseTypes(schema: GraphQLSchema, typeWeights: TypeWeightConfig): TypeWeightObject {
    const typeMap: ObjMap<GraphQLNamedType> = schema.getTypeMap();

    const result: TypeWeightObject = {};

    // Handle Object, Interface, Enum and Union types
    Object.keys(typeMap).forEach((type) => {
        const typeName: string = type.toLowerCase();

        const currentType: GraphQLNamedType = typeMap[type];
        // Get all types that aren't Query or Mutation or a built in type that starts with '__'
        if (type !== 'Query' && type !== 'Mutation' && !type.startsWith('__')) {
            if (isObjectType(currentType) || isInterfaceType(currentType)) {
                // Add the type and it's associated fields to the result
                result[typeName] = {
                    fields: {},
                    weight: typeWeights.object || DEFAULT_OBJECT_WEIGHT,
                };

                const fields = currentType.getFields();

                Object.keys(fields).forEach((field: string) => {
                    const fieldType: GraphQLOutputType = fields[field].type;

                    // Only scalars are considered here any other types should be references from the top level of the type weight object.
                    if (
                        isScalarType(fieldType) ||
                        (isNonNullType(fieldType) && isScalarType(fieldType.ofType))
                    ) {
                        result[typeName].fields[field] =
                            typeWeights.scalar || DEFAULT_SCALAR_WEIGHT;
                    }
                });
            } else if (isEnumType(currentType)) {
                result[typeName] = {
                    fields: {},
                    weight: typeWeights.scalar || DEFAULT_SCALAR_WEIGHT,
                };
            } else if (isUnionType(currentType)) {
                result[typeName] = {
                    fields: {},
                    weight: typeWeights.object || DEFAULT_OBJECT_WEIGHT,
                };
            }
        }
    });

    return result;
}

/**
 * The default typeWeightsConfig object is based off of Shopifys implementation of query
 * cost analysis. Our function should input a users configuration of type weights or fall
 * back on shopifys settings. We can change this later.
 *
 * This function should
 *  - iterate through the schema object and create the typeWeightObject as described in the tests
 *  - validate that the typeWeightsConfig parameter has no negative values (throw an error if it does)
 *
 * @param schema
 * @param typeWeightsConfig Defaults to {mutation: 10, object: 1, field: 0, connection: 2}
 */
function buildTypeWeightsFromSchema(
    schema: GraphQLSchema,
    typeWeightsConfig: TypeWeightConfig = defaultTypeWeightsConfig
): TypeWeightObject {
    if (!schema) throw new Error('Missing Argument: schema is required');

    //  Merge the provided type weights with the default to account for missing values
    const typeWeights: TypeWeightConfig = {
        ...defaultTypeWeightsConfig,
        ...typeWeightsConfig,
    };

    // Confirm that any custom weights are non-negative
    Object.entries(typeWeights).forEach((value: [string, number]) => {
        if (value[1] < 0) {
            throw new Error(`Type weights cannot be negative. Received: ${value[0]}: ${value[1]} `);
        }
    });

    const objectTypeWeights = parseTypes(schema, typeWeights);
    return parseQuery(schema, objectTypeWeights, typeWeights);
}

export default buildTypeWeightsFromSchema;
