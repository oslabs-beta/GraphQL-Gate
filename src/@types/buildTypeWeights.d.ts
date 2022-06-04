interface Fields {
    [index: string]: FieldWeight;
}
type WeightFunction = (args: ArgumentNode[]) => number;
type FieldWeight = number | WeightFunction;

interface Type {
    readonly weight: number;
    readonly fields: Fields;
}

interface TypeWeightObject {
    [index: string]: Type;
}

interface TypeWeightConfig {
    mutation?: number;
    query?: number;
    object?: number;
    scalar?: number;
    connection?: number;
}
