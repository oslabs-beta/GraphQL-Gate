import { query } from 'express';
import { ASTNode, DocumentNode, Kind } from 'graphql';

/**
 * This function should
 * 1. validate the query using graphql methods
 * 2. parse the query string using the graphql parse method
 * 3. itreate through the query AST and
 *      - cross reference the type weight object to check type weight
 *      - total all the eweights of all types in the query
 * 4. return the total as the query complexity
 *
 * TO DO: extend the functionality to work for mutations and subscriptions
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
    const recursive = (node: ASTNode, parent: ASTNode | null = null): number => {
        /** 
         * pseudo code of the process
         * 
        // if 'kind' property is 'Document'
            // iterate through queryAST.definitions array
            // call recursive with object

        // if 'kind' property is 'operationDefinition'
            // check 'operation' value against the type weights and add to total
            // call recursive with selectionSet property if it is not undefined

        // if 'kind' is 'selectionSet'
            // iterate shrough the 'selections' array of fields
            // if 'selectinSet' is not undefined, call recursive with the field

        // if 'kind' property is 'feild'
            // check the fields name.value against the type weights and total
            // if there is a match, it is an objcet type with feilds, 
                // call recursive with selectionSet property if it is not undefined
            // if it is not a match, it is a scalar field, look in the parent.name.value to check type weights feilds
        */

        let complexity = 0;
        const parentName: string = parent?.operation || parent?.name.value || null;

        if (node.kind === Kind.DOCUMENT) {
            // if 'kind' property is a 'Document'
            // iterate through queryAST.definitions array
            for (let i = 0; i < node.definitions.length; i + 1) {
                // call recursive with the definition node
                complexity += recursive(node.definitions[i], node);
            }
        } else if (node.kind === Kind.OPERATION_DEFINITION) {
            // if 'kind' property is 'operationDefinition'
            // TODO: case-sensitive
            if (node.operation in typeWeights) {
                // check 'operation' value against the type weights and add to total
                complexity += typeWeights[node.operation].weight;
                // call recursive with selectionSet property if it is not undefined
                if (node.selectionSet) complexity += recursive(node.selectionSet, node);
            }
        } else if (node.kind === Kind.SELECTION_SET) {
            // if 'kind' is 'selectionSet'
            // iterate shrough the 'selections' array of fields
            for (let i = 0; i < node.selections.length; i + 1) {
                // call recursive with the field
                complexity += recursive(node.selections[i], parent); // passing the current parent through because selection sets act only as intermediaries
            }
        } else if (node.kind === Kind.FIELD) {
            // if 'kind' property is 'field'
            // check the fields name.value against the type weights and total
            // TODO: case-sensitive
            if (node.name.value in typeWeights) {
                // if there is a match, it is an objcet type with feilds,
                complexity += typeWeights[node.name.value].weight;
                // call recursive with selectionSet property if it is not undefined
                if (node.selectionSet) complexity += recursive(node.selectionSet, node);
                // node.name.value in typeWeights[parent.operation || parent.name.value].fields
            } else if (parent?.opeartion) {
                // if it is not a match, it is a scalar field, look in the parent.name.value to check type weights feilds
                // TODO: if it is a list, need to look at the parent
                complexity += typeWeights[parent.name.value].fields[node.name.value];
            }
        }

        return complexity;
    };
    return recursive(queryAST);
}

export default getQueryTypeComplexity;
