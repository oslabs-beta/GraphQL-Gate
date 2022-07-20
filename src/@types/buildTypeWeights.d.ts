export interface Field {
    resolveTo?: string;
    weight?: FieldWeight;
}
export interface Fields {
    [index: string]: Field;
}
export type WeightFunction = (args: ArgumentNode[], variables, selectionsCost: number) => number;
export type FieldWeight = number | WeightFunction;
export interface Type {
    readonly weight: number;
    readonly fields: Fields;
}
export interface TypeWeightObject {
    [index: string]: Type;
}
export interface TypeWeightConfig {
    mutation?: number;
    query?: number;
    object?: number;
    scalar?: number;
    connection?: number;
}
export interface TypeWeightSet {
    mutation: number;
    query: number;
    object: number;
    scalar: number;
    connection: number;
}
type Variables = {
    [index: string]: readonly unknown;
};

// Type for use when getting fields for union types
type FieldMap = {
    [index: string]: {
        type: GraphQLOutputType;
        weight?: FieldWeight;
        resolveTo?: string;
    };
};
