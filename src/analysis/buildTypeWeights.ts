import {
    ArgumentNode,
    GraphQLArgument,
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
    isInputType,
    Kind,
    ValueNode,
    GraphQLUnionType,
    GraphQLFieldMap,
    isInputObjectType,
} from 'graphql';
import { ObjMap } from 'graphql/jsutils/ObjMap';
import { GraphQLSchema } from 'graphql/type/schema';
import {
    TypeWeightConfig,
    TypeWeightSet,
    TypeWeightObject,
    Variables,
    Type,
    Fields,
    FieldMap,
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
                // resolveTo: fields[field].name.toLowerCase(),
            };
        } else if (
            isInterfaceType(fieldType) ||
            isEnumType(fieldType) ||
            isObjectType(fieldType) ||
            isUnionType(fieldType)
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
        } else if (isNonNullType(fieldType)) {
            // TODO: Implment non-null types
            // not throwing and error since it causes typeWeight tests to break
        } else {
            // ? what else can get through here
            throw new Error(`ERROR: buildTypeWeight: Unsupported field type: ${fieldType}`);
        }
    });

    return result;
}

/**
 * Recursively compares two types for type equality based on type name
 * @param a
 * @param b
 * @returns true if the types are recursively equal.
 */
function compareTypes(a: GraphQLOutputType, b: GraphQLOutputType): boolean {
    // Base Case: Object or Scalar => compare type names
    // Recursive Case(List / NonNull): compare ofType
    return (
        (isObjectType(b) && isObjectType(a) && a.name === b.name) ||
        (isUnionType(b) && isUnionType(a) && a.name === b.name) ||
        (isEnumType(b) && isEnumType(a) && a.name === b.name) ||
        (isInterfaceType(b) && isInterfaceType(a) && a.name === b.name) ||
        (isScalarType(b) && isScalarType(a) && a.name === b.name) ||
        (isListType(b) && isListType(a) && compareTypes(b.ofType, a.ofType)) ||
        (isNonNullType(b) && isNonNullType(a) && compareTypes(a.ofType, b.ofType))
    );
}

/**
 *
 * @param unionType union type to be parsed
 * @param typeWeightObject type weight mapping object that must already contain all of the types in the schema.
 * @returns object mapping field names for each union type to their respective weights, resolve type names and resolve type object
 */
function getFieldsForUnionType(
    unionType: GraphQLUnionType,
    typeWeightObject: TypeWeightObject
): FieldMap[] {
    return unionType.getTypes().map((objectType: GraphQLObjectType) => {
        // Get the field data for this type
        const fields: GraphQLFieldMap<unknown, unknown> = objectType.getFields();

        const fieldMap: FieldMap = {};
        Object.keys(fields).forEach((field: string) => {
            // Get the weight of this field on from parent type on the root typeWeight object.
            // this only exists for scalars and lists (which resolve to a function);
            const { weight, resolveTo } =
                typeWeightObject[objectType.name.toLowerCase()].fields[field];

            fieldMap[field] = {
                type: fields[field].type,
                weight, // will only be undefined for object types
                resolveTo,
            };
        });
        return fieldMap;
    });
}

/**
 *
 * @param typesInUnion
 * @returns a single field map containg information for fields common to the union
 */
function getSharedFieldsFromUnionTypes(typesInUnion: FieldMap[]): FieldMap {
    return typesInUnion.reduce((prev: FieldMap, fieldMap: FieldMap): FieldMap => {
        // iterate through the field map checking the types for any common field names
        const sharedFields: FieldMap = {};
        Object.keys(prev).forEach((field: string) => {
            if (fieldMap[field]) {
                if (compareTypes(prev[field].type, fieldMap[field].type)) {
                    // they match add the type to the next set
                    sharedFields[field] = prev[field];
                }
            }
        });
        return sharedFields;
    });
}

/**
 * Parses the provided union types and returns a type weight object with any fields common to all types
 * in a union added to the union type
 * @param unionTypes union types to be parsed.
 * @param typeWeights object specifying generic type weights.
 * @param typeWeightObject original type weight object
 * @returns
 */
function parseUnionTypes(
    unionTypes: GraphQLUnionType[],
    typeWeights: TypeWeightSet,
    typeWeightObject: TypeWeightObject
) {
    const typeWeightsWithUnions: TypeWeightObject = { ...typeWeightObject };

    unionTypes.forEach((unionType: GraphQLUnionType) => {
        /**
         * 1. For each provided union type. We first obtain the fields for each object that
         *    is part of the union and store these in an object
         *    When obtaining types, save:
         *      - field name
         *      - type object to which the field resolves. This holds any information for recursive types (lists / not null / unions)
         *      - weight - for easy lookup later
         *      - resolveTo type - for easy lookup later
         * 2. We then reduce the array of objects from step 1 a single object only containing fields
         *    common to each type in the union. To determine field "equality" we compare the field names and
         *    recursively compare the field types:
         *  */

        // types is an array mapping each field name to it's respective output type
        // const typesInUnion = getFieldsForUnionType(unionType, typeWeightObject);
        const typesInUnion: FieldMap[] = getFieldsForUnionType(unionType, typeWeightObject);

        // reduce the data for all the types in the union
        const commonFields: FieldMap = getSharedFieldsFromUnionTypes(typesInUnion);

        // transform commonFields into the correct format for the type weight object
        const fieldTypes: Fields = {};

        Object.keys(commonFields).forEach((field: string) => {
            /**
             * The type weight object requires that:
             *   a. scalars have a weight
             *   b. lists have a resolveTo and weight property
             *   c. objects have a resolveTo type.
             *  */

            let current = commonFields[field].type;
            if (isNonNullType(current)) current = current.ofType;
            if (isScalarType(current)) {
                fieldTypes[field] = {
                    weight: commonFields[field].weight,
                };
            } else if (
                isObjectType(current) ||
                isInterfaceType(current) ||
                isUnionType(current) ||
                isEnumType(current)
            ) {
                fieldTypes[field] = {
                    resolveTo: commonFields[field].resolveTo,
                };
            } else if (isListType(current)) {
                fieldTypes[field] = {
                    resolveTo: commonFields[field].resolveTo,
                    weight: commonFields[field].weight,
                };
            } else {
                throw new Error('Unhandled union type. Should never get here');
            }
        });
        typeWeightsWithUnions[unionType.name.toLowerCase()] = {
            fields: fieldTypes,
            weight: typeWeights.object,
        };
    });

    return typeWeightsWithUnions;
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

    const unions: GraphQLUnionType[] = [];

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
                unions.push(currentType);
            } else if (!isScalarType(currentType) && !isInputObjectType(currentType)) {
                throw new Error(`ERROR: buildTypeWeight: Unsupported type: ${currentType}`);
            }
        }
    });

    return parseUnionTypes(unions, typeWeights, result);
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
