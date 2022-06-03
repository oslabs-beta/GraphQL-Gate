import {
    ArgumentNode,
    GraphQLArgument,
    GraphQLFieldMap,
    GraphQLNamedType,
    GraphQLObjectType,
    GraphQLOutputType,
    IntValueNode,
    isCompositeType,
    isEnumType,
    isInterfaceType,
    isListType,
    isNonNullType,
    isObjectType,
    isScalarType,
    isUnionType,
    ValueNode,
} from 'graphql';
import { Maybe } from 'graphql/jsutils/Maybe';
import { ObjMap } from 'graphql/jsutils/ObjMap';
import { GraphQLSchema } from 'graphql/type/schema';

export const KEYWORDS = ['first', 'last', 'limit'];

/**
 * Default TypeWeight Configuration:
 * mutation: 10
 * object: 1
 * scalar: 0
 * connection: 2
 */

// These variables exist to provide a default value for typescript when accessing a weight
// since all props are optioal in TypeWeightConfig
const DEFAULT_MUTATION_WEIGHT = 10;
const DEFAULT_OBJECT_WEIGHT = 1;
const DEFAULT_SCALAR_WEIGHT = 0;
const DEFAULT_CONNECTION_WEIGHT = 2;
const DEFAULT_QUERY_WEIGHT = 1;

// FIXME: What about Union, Enum and Interface defaults

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

    const typeMap: ObjMap<GraphQLNamedType> = schema.getTypeMap();

    // Handle Object, Interface, Enum and Union types
    Object.keys(typeMap).forEach((type) => {
        const currentType: GraphQLNamedType = typeMap[type];
        // Get all types that aren't Query or Mutation or a built in type that starts with '__'
        if (
            currentType.name !== 'Query' &&
            currentType.name !== 'Mutation' &&
            !currentType.name.startsWith('__')
        ) {
            if (isObjectType(currentType) || isInterfaceType(currentType)) {
                // Add the type to the result
                result[type.toLowerCase()] = {
                    fields: {},
                    weight: typeWeights.object || DEFAULT_OBJECT_WEIGHT,
                };

                const fields = currentType.getFields();

                Object.keys(fields).forEach((field: string) => {
                    const fieldType: GraphQLOutputType = fields[field].type;
                    if (
                        isScalarType(fieldType) ||
                        (isNonNullType(fieldType) && isScalarType(fieldType.ofType))
                    ) {
                        result[type.toLowerCase()].fields[field] =
                            typeWeights.scalar || DEFAULT_SCALAR_WEIGHT;
                    }
                });
            } else if (isEnumType(currentType)) {
                result[currentType.name.toLowerCase()] = {
                    fields: {},
                    weight: typeWeights.scalar || DEFAULT_SCALAR_WEIGHT,
                };
            } else if (isUnionType(currentType)) {
                result[currentType.name.toLowerCase()] = {
                    fields: {},
                    weight: typeWeights.object || DEFAULT_OBJECT_WEIGHT,
                };
            }
        }
    });

    // Get any Query fields (these are the queries that the API exposes)
    const queryType: Maybe<GraphQLObjectType> = schema.getQueryType();

    if (queryType) {
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
                if (KEYWORDS.includes(arg.name) && isListType(resolveType)) {
                    const defaultVal: number = <number>arg.defaultValue;

                    // Get the type that comprises the list
                    const listType = resolveType.ofType;

                    // Composite Types are Objects, Interfaces and Unions.
                    if (isCompositeType(listType)) {
                        // Set the field weight to a function that accepts
                        // TODO: Accept ArgumentNode[] and look for the arg we need.
                        // TODO: Test this function
                        result.query.fields[field] = (args: ArgumentNode[]): number => {
                            // Function should receive object with arg, value as k, v pairs
                            // function iterate on this object looking for a keyword then returns
                            const limitArg: ArgumentNode | undefined = args.find(
                                (cur) => cur.name.value === arg.name
                            );

                            // FIXME: Need to use the value of this variable
                            // const isVariable = (node: any): node is VariableNode => {
                            //     if (node as VariableNode) return true;
                            //     return false;
                            // };

                            const isIntNode = (node: any): node is IntValueNode => {
                                if (node as IntValueNode) return true;
                                return false;
                            };

                            if (limitArg) {
                                const node: ValueNode = limitArg.value;

                                // FIXME: Is there a better way to check for the type here?
                                if (isIntNode(node)) {
                                    const multiplier = Number(node.value || arg.defaultValue);

                                    return result[listType.name.toLowerCase()].weight * multiplier;
                                }
                            }

                            // FIXME: The list is unbounded. Return the object weight
                            return result[listType.name.toLowerCase()].weight;
                        };
                    } else {
                        // TODO: determine the type of the list and use the appropriate weight
                        // TODO: This should multiply as well
                        result.query.fields[field] = typeWeights.scalar || DEFAULT_SCALAR_WEIGHT;
                    }
                }
            });

            // if the field is a scalar set weight accordingly
            // FIXME: Enums shouldn't be here???
            if (isScalarType(resolveType) || isEnumType(resolveType)) {
                result.query.fields[field] = typeWeights.scalar || DEFAULT_SCALAR_WEIGHT;
            }
        });
    }

    return result;
}

export default buildTypeWeightsFromSchema;
