import { parse } from 'graphql';

enum ComplexityOption {
    resolve = 'resolve',
    type = 'type',
}

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
 * @param {string} queryString
 * @param {TypeWeightObject} typeWeights
 * @param {string} complexityOption
 */
function getQueryComplexity(
    queryString: string,
    typeWeights: TypeWeightObject,
    // todo: see if enums are the best way to represent complexityOption
    complexityOption: string // can only be 'resolve' or 'type'
): number {
    throw Error('getQueryComplexity is not implemented.');
}

export default getQueryComplexity;
