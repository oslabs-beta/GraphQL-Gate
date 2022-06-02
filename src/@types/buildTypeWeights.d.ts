interface Fields {
    [index: string]: number | ((args: ArgumentNode[]) => number);
}

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
