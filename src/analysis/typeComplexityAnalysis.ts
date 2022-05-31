import { parse } from 'graphql';

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
// TODO add queryVaribables parameter
function getQueryTypeComplexity(queryString: string, typeWeights: TypeWeightObject): number {
    throw Error('getQueryComplexity is not implemented.');
}

export default getQueryTypeComplexity;
