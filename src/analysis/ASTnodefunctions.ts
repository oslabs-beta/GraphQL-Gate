import {
    DocumentNode,
    FieldNode,
    SelectionSetNode,
    DefinitionNode,
    Kind,
    SelectionNode,
} from 'graphql';

export function fieldNode(
    node: FieldNode,
    typeWeights: TypeWeightObject,
    variables: any | undefined,
    parent: FieldNode | DefinitionNode
): number {
    const complexity = 0;
    return complexity;
}

export function selectionNode(
    node: SelectionNode,
    typeWeights: TypeWeightObject,
    variables: any | undefined,
    parent: DefinitionNode | FieldNode
): number {
    let complexity = 0;
    // check the kind property against the set of selection nodes that are possible
    if (node.kind === Kind.FIELD) {
        // call the function that handle field nodes and multiply the result into complexity to accound for nested fields
        complexity *= fieldNode(node, typeWeights, variables, parent);
    }
    // TODO: add checks for Kind.FRAGMENT_SPREAD and Kind.INLINE_FRAGMENT here
    return complexity;
}

export function selectionSetNode(
    node: SelectionSetNode,
    typeWeights: TypeWeightObject,
    variables: any | undefined,
    parent: DefinitionNode | FieldNode
): number {
    let complexity = 0;
    // iterate shrough the 'selections' array on the seletion set node
    for (let i = 0; i < node.selections.length; i + 1) {
        // call the function to handle seletion nodes
        // pass the current parent through because selection sets act only as intermediaries
        complexity += selectionNode(node.selections[i], typeWeights, variables, parent);
    }
    return complexity;
}

export function definitionNode(
    node: DefinitionNode,
    typeWeights: TypeWeightObject,
    variables: any | undefined
): number {
    let complexity = 0;
    // check the kind property against the set of definiton nodes that are possible
    if (node.kind === Kind.OPERATION_DEFINITION) {
        // check if the operation is in the type weights object.
        if (node.operation.toLocaleLowerCase() in typeWeights) {
            // if it is, it is an object type, add it's type weight to the total
            complexity += typeWeights[node.operation].weight;
            // call the function to handle selection set node with selectionSet property if it is not undefined
            if (node.selectionSet)
                complexity += selectionSetNode(node.selectionSet, typeWeights, variables, node);
        }
    }
    // TODO: add checks for Kind.FRAGMENT_DEFINITION here (there are other type definition nodes that i think we can ignore. see ast.d.ts in 'graphql')
    return complexity;
}

export function documentNode(
    node: DocumentNode,
    typeWeights: TypeWeightObject,
    variables: any | undefined
): number {
    let complexity = 0;
    // iterate through 'definitions' array on the document node
    for (let i = 0; i < node.definitions.length; i + 1) {
        // call the function to handle the various types of definition nodes
        complexity += definitionNode(node.definitions[i], typeWeights, variables);
    }
    return complexity;
}
