import { ASTNode, DocumentNode, Kind } from 'graphql';
import {
    selectionSetNode,
    fieldNode,
    documentNode,
    operationDefinitionNode,
} from './ASTnodefunctions';

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
function getQueryTypeComplexity(
    queryAST: DocumentNode,
    variables: any | undefined,
    typeWeights: TypeWeightObject
): number {
    let complexity = 0;
    complexity += documentNode(queryAST, typeWeights, variables);
    return complexity;
}

export default getQueryTypeComplexity;
