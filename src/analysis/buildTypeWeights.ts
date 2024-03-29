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

// default configuration weights for GraphQL types
export const defaultTypeWeightsConfig: TypeWeightSet = {
    mutation: 10,
    object: 1,
    scalar: 0,
    connection: 2,
    query: 1,
};

/**
 * Parses the fields on an object type (query, object, interface) and returns field weights in type weight object format
 *
 * @param {(GraphQLObjectType | GraphQLInterfaceType)} type
 * @param {TypeWeightObject} typeWeightObject
 * @param {TypeWeightSet} typeWeights
 * @param {boolean} enforceBoundedLists
 * @return {Type}
 */
function parseObjectFields(
    type: GraphQLObjectType | GraphQLInterfaceType,
    typeWeightObject: TypeWeightObject,
    typeWeights: TypeWeightSet,
    enforceBoundedLists: boolean
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
                // fieldAdded is a boolean flag to check if we have added a something to the typeweight object for this field.
                // if we reach end of the list and fieldAdded is false, we have an unbounded list.
                let fieldAdded = false;
                // if the @listCost directive is given for the field, apply the cost argument's value to the field's weight
                const directives = fields[field].astNode?.directives;
                if (directives && directives.length > 0) {
                    directives.forEach((dir) => {
                        if (dir.name.value === 'listCost') {
                            fieldAdded = true;
                            if (
                                dir.arguments &&
                                dir.arguments[0].value.kind === Kind.INT &&
                                Number(dir.arguments[0].value.value) >= 0
                            ) {
                                result.fields[field] = {
                                    resolveTo: listType.toString().toLocaleLowerCase(),
                                    weight: Number(dir.arguments[0].value.value),
                                };
                            } else {
                                throw new SyntaxError(`@listCost directive improperly configured`);
                            }
                        }
                    });
                }

                // chcek for slicing arguments on field for bounding lists
                fields[field].args.forEach((arg: GraphQLArgument) => {
                    // If field has an argument matching one of the limiting keywords and resolves to a list
                    // then the weight of the field should be dependent on both the weight of the resolved type and the limiting argument.
                    if (KEYWORDS.includes(arg.name)) {
                        // Get the type that comprises the list
                        fieldAdded = true;
                        /** "weight" property is a function that calculates the list complexity based:
                         * 1.  on the cost of it's field selections
                         * 2. the value of the slicing argment (multiplier)
                         * 3. the wight of the field itself  */
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
                                let multiplier = 1;
                                if (limitArg) {
                                    const node: ValueNode = limitArg.value;
                                    if (Kind.INT === node.kind) {
                                        multiplier = Number(node.value || arg.defaultValue);
                                    }
                                    if (Kind.VARIABLE === node.kind) {
                                        multiplier = Number(
                                            variables[node.name.value] || arg.defaultValue
                                        );
                                    }
                                    // ? what else can get through here
                                } else if (arg.defaultValue) {
                                    // if there is no argument provided with the query, check the schema for a default
                                    multiplier = Number(arg.defaultValue);
                                }
                                // if there is no argument or defaultValue, multiplier will still be one, effectively making list size equel to 1 as a last resort
                                return multiplier * (selectionsCost + weight);
                            },
                        };
                    }
                });

                // throw an error if an unbounded list has no @listCost directive attached or slicing arguments
                // and the enforceBoundedLists configuration option is sent to true
                if (fieldAdded === false && enforceBoundedLists) {
                    throw new Error(
                        `ERROR: buildTypeWeights: Use directive @listCost(cost: Int!) on unbounded lists, or limit query results with ${KEYWORDS}`
                    );
                }
            }
        } else {
            // FIXME what else can get through here
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
 * @param enforceBoundedLists
 * @returns
 */
function parseTypes(
    schema: GraphQLSchema,
    typeWeights: TypeWeightSet,
    enforceBoundedLists: boolean
): TypeWeightObject {
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
                result[typeName] = parseObjectFields(
                    currentType,
                    result,
                    typeWeights,
                    enforceBoundedLists
                );
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

    // parse union types to complete the build of the typeWeightObject
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
 * @param enforceBoundedLists Defaults to false
 * @param typeWeightsConfig Defaults to {mutation: 10, object: 1, field: 0, connection: 2}
 */
function buildTypeWeightsFromSchema(
    schema: GraphQLSchema,
    typeWeightsConfig: TypeWeightConfig = defaultTypeWeightsConfig,
    enforceBoundedLists = false
): TypeWeightObject {
    try {
        if (!schema) throw new Error('Missing Argument: schema is required');

        //  Merge the provided type weights with the default to account for missing values
        const typeWeights: TypeWeightSet = {
            ...defaultTypeWeightsConfig,
            ...typeWeightsConfig,
        };

        // Confirm that any custom weights are non-negative
        Object.entries(typeWeights).forEach((value: [string, number]) => {
            if (value[1] < 0) {
                throw new Error(
                    `Type weights cannot be negative. Received: ${value[0]}: ${value[1]} `
                );
            }
        });

        return parseTypes(schema, typeWeights, enforceBoundedLists);
    } catch (err) {
        throw new Error(`Error in expressGraphQLRateLimiter when parsing schema object: ${err}`);
    }
}

export default buildTypeWeightsFromSchema;
