import { ASTNode, DocumentNode, Kind } from 'graphql';

/**
 * Calculate the complexity for the query by recursivly traversing through the query AST,
 * checking the query fields against the type weight object and totaling the weights of every field.
 *
 * TO DO: extend the functionality to work for mutations and subscriptions and directives
 *
 * @param {string} queryAST
 * @param {any | undefined} varibales
 * @param {TypeWeightObject} typeWeights
 */
// TODO add queryVaribables parameter
function getQueryTypeComplexity(
    queryAST: DocumentNode,
    varibales: any | undefined,
    typeWeights: TypeWeightObject
): number {
    const getComplexityOfNode = (node: ASTNode, parent: ASTNode = node): number => {
        let complexity = 0;

        if (node.kind === Kind.DOCUMENT) {
            // if 'kind' property is a 'Document'
            // iterate through queryAST.definitions array
            for (let i = 0; i < node.definitions.length; i + 1) {
                // call recursive with the definition node
                complexity += getComplexityOfNode(node.definitions[i], node);
            }
        } else if (node.kind === Kind.OPERATION_DEFINITION) {
            // if 'kind' property is 'operationDefinition'
            // TODO: case-sensitive
            if (node.operation.toLocaleLowerCase() in typeWeights) {
                // check 'operation' value against the type weights and add to total
                complexity += typeWeights[node.operation].weight;
                // call recursive with selectionSet property if it is not undefined
                if (node.selectionSet) complexity += getComplexityOfNode(node.selectionSet, node);
            }
        } else if (node.kind === Kind.SELECTION_SET) {
            // if 'kind' is 'selectionSet'
            // iterate shrough the 'selections' array of fields
            for (let i = 0; i < node.selections.length; i + 1) {
                // call recursive with the field
                complexity += getComplexityOfNode(node.selections[i], parent); // passing the current parent through because selection sets act only as intermediaries
            }
        } else if (node.kind === Kind.FIELD) {
            // if 'kind' property is 'field'
            // check the fields name.value against the type weights and total
            // TODO: case-sensitive
            if (node.name.value.toLocaleLowerCase() in typeWeights) {
                // if there is a match, it is an objcet type with feilds,
                complexity += typeWeights[node.name.value].weight;
                // call recursive with selectionSet property if it is not undefined
                if (node.selectionSet) complexity += getComplexityOfNode(node.selectionSet, node);
                // node.name.value in typeWeights[parent.operation || parent.name.value].fields
            } else {
                // TODO: if it is not a match, it is a scalar field or list,
                // if (parent?.objective !== null) {
                // }
                // const weight = typeWeights[parent.name.value].fields[node.name.value];
            }
        }
        return complexity;
    };
    return getComplexityOfNode(queryAST);
}

export default getQueryTypeComplexity;
