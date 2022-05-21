interface Fields {
    [index: string]: number;
}

interface Type {
    weight: number;
    fields: Fields;
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
