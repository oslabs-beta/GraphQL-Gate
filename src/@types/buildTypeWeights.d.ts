interface Fields {
    readonly [index: string]: number;
}

interface Type {
    readonly weight: number;
    readonly fields: Fields;
}

interface TypeWeightObject {
    readonly [index: string]: Type;
}

interface TypeWeightConfig {
    mutation?: number;
    query?: number;
    object?: number;
    scalar?: number;
    connection?: number;
}
