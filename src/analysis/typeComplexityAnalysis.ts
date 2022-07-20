import { DocumentNode } from 'graphql';
import { TypeWeightObject, Variables } from '../@types/buildTypeWeights';
import ASTParser from './ASTParser';

/**
 * Calculate the complexity for the query by recursivly traversing through the query AST,
 * checking the query fields against the type weight object and totaling the weights of every field.
 *
 * TO DO: extend the functionality to work for mutations and subscriptions and directives
 *
 * @param {string} queryAST
 * @param {Variables} variables
 * @param {TypeWeightObject} typeWeights
 */
function getQueryTypeComplexity(
    queryAST: DocumentNode,
    variables: Variables,
    typeWeights: TypeWeightObject
): number {
    let complexity = 0;
    const parser = new ASTParser(typeWeights, variables);
    complexity += parser.documentNode(queryAST);
    return complexity;
}

export default getQueryTypeComplexity;
