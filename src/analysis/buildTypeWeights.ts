import {
    ArgumentNode,
    GraphQLArgument,
    GraphQLNamedType,
    GraphQLObjectType,
    GraphQLScalarType,
    GraphQLInterfaceType,
    GraphQLList,
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
import {
    TypeWeightConfig,
    TypeWeightSet,
    TypeWeightObject,
    Variables,
    Type,
} from '../@types/buildTypeWeights';

export const KEYWORDS = ['first', 'last', 'limit'];

// These variables exist to provide a default value for typescript when accessing a weight
// since all props are optioal in TypeWeightConfig
const DEFAULT_MUTATION_WEIGHT = 10;
const DEFAULT_OBJECT_WEIGHT = 1;
const DEFAULT_SCALAR_WEIGHT = 0;
const DEFAULT_CONNECTION_WEIGHT = 2;
const DEFAULT_QUERY_WEIGHT = 1;
export const defaultTypeWeightsConfig: TypeWeightSet = {
    mutation: DEFAULT_MUTATION_WEIGHT,
    object: DEFAULT_OBJECT_WEIGHT,
    scalar: DEFAULT_SCALAR_WEIGHT,
    connection: DEFAULT_CONNECTION_WEIGHT,
    query: DEFAULT_QUERY_WEIGHT,
};

// FIXME: What about Interface defaults

/**
 * Parses the fields on an object type (query, object, interface) and returns field weights in type weight object format
 *
 * @param {(GraphQLObjectType | GraphQLInterfaceType)} type
 * @param {TypeWeightObject} typeWeightObject
 * @param {TypeWeightSet} typeWeights
 * @return {*}  {Type}
 */
function parseObjectFields(
    type: GraphQLObjectType | GraphQLInterfaceType,
    typeWeightObject: TypeWeightObject,
    typeWeights: TypeWeightSet
): Type {
    let result: Type;
    switch (type.name) {
        case 'Query':
            result = { weight: typeWeights.query, fields: {} };
            break;
        case 'Mutation':
            result = { weight: typeWeights.mutation, fields: {} };
            break;
        default:
            result = { weight: typeWeights.object, fields: {} };
            break;
    }

    const fields = type.getFields();

    // Iterate through the fields and add the required data to the result
    Object.keys(fields).forEach((field: string) => {
        // The GraphQL type that this field represents
        let fieldType: GraphQLOutputType = fields[field].type;
        if (isNonNullType(fieldType)) fieldType = fieldType.ofType;
        if (isScalarType(fieldType)) {
            result.fields[field] = {
                weight: typeWeights.scalar,
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
            // 'listType' is the GraphQL type that the list resolves to
            let listType = fieldType.ofType;
            if (isNonNullType(listType)) listType = listType.ofType;
            if (isScalarType(listType) && typeWeights.scalar === 0) {
                // list won't compound if weight is zero
                result.fields[field] = {
                    weight: typeWeights.scalar,
                };
            } else if (isEnumType(listType) && typeWeights.scalar === 0) {
                // list won't compound if weight of enum is zero
                result.fields[field] = {
                    resolveTo: listType.toString().toLocaleLowerCase(),
                };
            } else {
                fields[field].args.forEach((arg: GraphQLArgument) => {
                    // If field has an argument matching one of the limiting keywords and resolves to a list
                    // then the weight of the field should be dependent on both the weight of the resolved type and the limiting argument.
                    if (KEYWORDS.includes(arg.name)) {
                        // Get the type that comprises the list
                        result.fields[field] = {
                            resolveTo: listType.toString().toLocaleLowerCase(),
                            weight: (
                                args: ArgumentNode[],
                                variables: Variables,
                                selectionsCost: number
                            ): number => {
                                const limitArg: ArgumentNode | undefined = args.find(
                                    (cur) => cur.name.value === arg.name
                                );
                                const weight = isCompositeType(listType)
                                    ? typeWeightObject[listType.name.toLowerCase()].weight
                                    : typeWeights.scalar; // Note this includes enums
                                if (limitArg) {
                                    const node: ValueNode = limitArg.value;
                                    let multiplier = 1;
                                    if (Kind.INT === node.kind) {
                                        multiplier = Number(node.value || arg.defaultValue);
                                    }
                                    if (Kind.VARIABLE === node.kind) {
                                        multiplier = Number(
                                            variables[node.name.value] || arg.defaultValue
                                        );
                                    }
                                    return multiplier * (selectionsCost + weight);
                                    // ? what else can get through here
                                }
                                // if there is no argument provided with the query, check the schema for a default
                                if (arg.defaultValue) {
                                    return Number(arg.defaultValue) * (selectionsCost + weight);
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
 * Parses all types in the provided schema object excempt for Query, Mutation
 * and built in types that begin with '__' and outputs a new TypeWeightObject
 * @param schema
 * @param typeWeights
 * @returns
 */
function parseTypes(schema: GraphQLSchema, typeWeights: TypeWeightSet): TypeWeightObject {
    const typeMap: ObjMap<GraphQLNamedType> = schema.getTypeMap();

    const result: TypeWeightObject = {};

    // Handle Object, Interface, Enum and Union types
    Object.keys(typeMap).forEach((type) => {
        const typeName: string = type.toLowerCase();
        const currentType: GraphQLNamedType = typeMap[type];

        // Get all types that aren't Query or Mutation or a built in type that starts with '__'
        if (!type.startsWith('__')) {
            if (isObjectType(currentType) || isInterfaceType(currentType)) {
                // Add the type and it's associated fields to the result
                result[typeName] = parseObjectFields(currentType, result, typeWeights);
            } else if (isEnumType(currentType)) {
                result[typeName] = {
                    fields: {},
                    weight: typeWeights.scalar,
                };
            } else if (isUnionType(currentType)) {
                // FIXME: will need information on fields inorder calculate comlpextiy
                result[typeName] = {
                    fields: {},
                    weight: typeWeights.object,
                };
            } else {
                // ? what else can get through here
                // ? inputTypes?
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
    const typeWeights: TypeWeightSet = {
        ...defaultTypeWeightsConfig,
        ...typeWeightsConfig,
    };

    // Confirm that any custom weights are non-negative
    Object.entries(typeWeights).forEach((value: [string, number]) => {
        if (value[1] < 0) {
            throw new Error(`Type weights cannot be negative. Received: ${value[0]}: ${value[1]} `);
        }
    });

    return parseTypes(schema, typeWeights);
}

export default buildTypeWeightsFromSchema;
