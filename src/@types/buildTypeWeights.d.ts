export interface Field {
    resolveTo?: string;
    weight?: FieldWeight;
}
export interface Fields {
    [index: string]: Field;
}
export type WeightFunction = (args: ArgumentNode[], variables) => number;
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
type Variables = {
    [index: string]: readonly unknown;
};

// export interface Fields {
//     [index: string]: FieldWeight;
// }
// export type WeightFunction = (args: ArgumentNode[], variables) => number;
// export type FieldWeight = number | WeightFunction;
// export interface Type {
//     readonly weight: number;
//     readonly fields: Fields;
// }
// export interface TypeWeightObject {
//     [index: string]: Type;
// }
// export interface TypeWeightConfig {
//     mutation?: number;
//     query?: number;
//     object?: number;
//     scalar?: number;
//     connection?: number;
// }

// type Variables = {
//     [index: string]: readonly unknown;
// };
