import {
    ArgumentNode,
    GraphQLArgument,
    GraphQLFieldMap,
    GraphQLNamedType,
    GraphQLObjectType,
    GraphQLInterfaceType,
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
import { TypeWeightConfig, TypeWeightObject, Variables, Type } from '../@types/buildTypeWeights';

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
function parseObjectFields(
    type: GraphQLObjectType | GraphQLInterfaceType,
    typeWeightObject: TypeWeightObject,
    typeWeights: TypeWeightConfig
): Type {
    const result: Type = {
        fields: {},
        weight: typeWeights.object || DEFAULT_OBJECT_WEIGHT,
    };
    const fields = type.getFields();

    Object.keys(fields).forEach((field: string) => {
        const fieldType: GraphQLOutputType = fields[field].type;

        if (
            isScalarType(fieldType) ||
            (isNonNullType(fieldType) && isScalarType(fieldType.ofType))
        ) {
            result.fields[field] = {
                weight: typeWeights.scalar || DEFAULT_SCALAR_WEIGHT,
            };
        } else if (
            isInterfaceType(fieldType) ||
            isUnionType(fieldType) ||
            isEnumType(fieldType) ||
            isObjectType(fieldType)
        ) {
            result.fields[field] = {
                resolveTo: fieldType.name.toLocaleLowerCase(),
            };
        } else if (isListType(fieldType)) {
            const listType = fieldType.ofType;
            if (
                (listType.toString() === 'Int' ||
                    listType.toString() === 'String' ||
                    listType.toString() === 'Id') &&
                typeWeights.scalar === DEFAULT_SCALAR_WEIGHT
            ) {
                result.fields[field] = {
                    weight: typeWeights.scalar || DEFAULT_SCALAR_WEIGHT,
                };
            } else if (isEnumType(listType) && typeWeights.scalar === DEFAULT_SCALAR_WEIGHT) {
                result.fields[field] = {
                    resolveTo: listType.toString().toLocaleLowerCase(),
                };
            } else {
                fields[field].args.forEach((arg: GraphQLArgument) => {
                    // If query has an argument matching one of the limiting keywords and resolves to a list then the weight of the query
                    // should be dependent on both the weight of the resolved type and the limiting argument.
                    // FIXME: Can nonnull wrap list types?
                    if (KEYWORDS.includes(arg.name)) {
                        // Get the type that comprises the list
                        result.fields[field] = {
                            resolveTo: listType.toString().toLocaleLowerCase(),
                            weight: (args: ArgumentNode[], variables: Variables): number => {
                                const limitArg: ArgumentNode | undefined = args.find(
                                    (cur) => cur.name.value === arg.name
                                );
                                if (limitArg) {
                                    const node: ValueNode = limitArg.value;

                                    if (Kind.INT === node.kind) {
                                        const multiplier = Number(node.value || arg.defaultValue);
                                        const weight = isCompositeType(listType)
                                            ? typeWeightObject[listType.name.toLowerCase()].weight
                                            : typeWeights.scalar || DEFAULT_SCALAR_WEIGHT; // Note this includes enums

                                        return weight * multiplier;
                                    }

                                    if (Kind.VARIABLE === node.kind) {
                                        const multiplier = Number(variables[node.name.value]);
                                        const weight = isCompositeType(listType)
                                            ? typeWeightObject[listType.name.toLowerCase()].weight
                                            : typeWeights.scalar || DEFAULT_SCALAR_WEIGHT; // Note this includes enums

                                        return weight * multiplier;
                                    }
                                }

                                // FIXME: The list is unbounded. Return the object weight for
                                throw new Error(
                                    `ERROR: buildTypeWeights: Unbouned list complexity not supported. Query results should be limited with ${KEYWORDS}`
                                );
                            },
                        };
                    }
                });
            }
        } else {
            // ? what else can get through here
        }
    });

    return result;
}
/**
 * Parses the Query type in the provided schema object and outputs a new TypeWeightObject
 * @param schema
 * @param typeWeightObject
 * @param typeWeights
 * @returns
 */
function parseQueryType(
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
        if (isListType(resolveType)) {
            const listType = resolveType.ofType;
            if (
                (listType.toString() === 'Int' ||
                    listType.toString() === 'String' ||
                    listType.toString() === 'Id') &&
                typeWeights.scalar === DEFAULT_SCALAR_WEIGHT
            ) {
                result.query.fields[field] = {
                    weight: typeWeights.scalar || DEFAULT_SCALAR_WEIGHT,
                };
            } else if (isEnumType(listType) && typeWeights.scalar === DEFAULT_SCALAR_WEIGHT) {
                result.query.fields[field] = {
                    resolveTo: listType.toString().toLocaleLowerCase(),
                };
            } else {
                queryFields[field].args.forEach((arg: GraphQLArgument) => {
                    // If query has an argument matching one of the limiting keywords and resolves to a list then the weight of the query
                    // should be dependent on both the weight of the resolved type and the limiting argument.
                    // FIXME: Can nonnull wrap list types?

                    if (KEYWORDS.includes(arg.name)) {
                        // Get the type that comprises the list
                        result.query.fields[field] = {
                            resolveTo: listType.toString().toLocaleLowerCase(),
                            weight: (args: ArgumentNode[], variables: Variables): number => {
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
                                        const multiplier = Number(variables[node.name.value]);
                                        const weight = isCompositeType(listType)
                                            ? result[listType.name.toLowerCase()].weight
                                            : typeWeights.scalar || DEFAULT_SCALAR_WEIGHT; // Note this includes enums

                                        return weight * multiplier;
                                    }
                                }

                                // FIXME: The list is unbounded. Return the object weight for
                                throw new Error(
                                    `ERROR: buildTypeWeights: Unbouned list complexity not supported. Query results should be limited with ${KEYWORDS}`
                                );
                            },
                        };
                    }
                });
            }
        } else if (isScalarType(resolveType)) {
            // if the field is a scalar or an enum set weight accordingly. It is not a list in this case
            result.query.fields[field] = {
                weight: typeWeights.scalar || DEFAULT_SCALAR_WEIGHT,
            };
        } else if (isEnumType(resolveType) || isObjectType(resolveType)) {
            result.query.fields[field] = {
                resolveTo: resolveType.name.toLowerCase(),
            };
        } else {
            // ? what could be sliding through here?
        }
    });
    return result;
}

/**
 * Parses all types in the provided schema object excempt for Query, Mutation
 * and built in types that begin with '__' and outputs a new TypeWeightObject
 * @param schema
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
                result[typeName] = parseObjectFields(currentType, result, typeWeights);
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
            } else {
                // ? what else can get through here
            }
        }
    });

    return result;
}

/**
 *
 *
 *
 */

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
    return parseQueryType(schema, objectTypeWeights, typeWeights);
}

export default buildTypeWeightsFromSchema;
