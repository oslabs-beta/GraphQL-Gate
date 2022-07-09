import {
    DocumentNode,
    FieldNode,
    SelectionSetNode,
    DefinitionNode,
    Kind,
    SelectionNode,
} from 'graphql';
import { TypeWeightObject, Variables } from '../@types/buildTypeWeights';
/**
 * The AST node functions call each other following the nested structure below
 * Each function handles a specific GraphQL AST node type
 *
 * AST nodes call each other in the following way
 *
 *                        Document Node
 *                            |
 *                        Definiton Node
 *              (operation and fragment definitons)
 *                     /                \
 *  |-----> Selection Set Node         not done
 *  |               /
 *  |          Selection Node
 *  |  (Field, Inline fragment and fragment spread)
 *  |      |            \               \
 *  |--Field Node       not done       not done
 *
 */

class ASTParser {
    fragmentCache: { [index: string]: number };

    constructor() {
        this.fragmentCache = {};
    }

    fieldNode(
        node: FieldNode,
        typeWeights: TypeWeightObject,
        variables: Variables,
        parentName: string
    ): number {
        let complexity = 0;
        // 'resolvedTypeName' is the name of the Schema Type that this field resolves to
        const resolvedTypeName =
            node.name.value in typeWeights
                ? node.name.value
                : typeWeights[parentName].fields[node.name.value]?.resolveTo || null;

        if (resolvedTypeName) {
            // field resolves to an object or a list with possible selections
            let selectionsCost = 0;
            let calculatedWeight = 0;
            const weightFunction = typeWeights[parentName]?.fields[node.name.value]?.weight;

            // call the function to handle selection set node with selectionSet property if it is not undefined
            if (node.selectionSet) {
                selectionsCost += this.selectionSetNode(
                    node.selectionSet,
                    typeWeights,
                    variables,
                    resolvedTypeName
                );
            }
            // if there are arguments and this is a list, call the 'weightFunction' to get the weight of this field. otherwise the weight is static and can be accessed through the typeWeights object
            if (node.arguments && typeof weightFunction === 'function') {
                calculatedWeight += weightFunction([...node.arguments], variables, selectionsCost);
            } else {
                calculatedWeight += typeWeights[resolvedTypeName].weight + selectionsCost;
            }
            complexity += calculatedWeight;
        } else {
            // field is a scalar and 'weight' is a number
            const { weight } = typeWeights[parentName].fields[node.name.value];
            if (typeof weight === 'number') {
                complexity += weight;
            }
        }
        return complexity;
    }

    selectionNode(
        node: SelectionNode,
        typeWeights: TypeWeightObject,
        variables: Variables,
        parentName: string
    ): number {
        let complexity = 0;
        // check the kind property against the set of selection nodes that are possible
        if (node.kind === Kind.FIELD) {
            // call the function that handle field nodes
            complexity += this.fieldNode(node, typeWeights, variables, parentName);
        } else if (node.kind === Kind.FRAGMENT_SPREAD) {
            complexity += this.fragmentCache[node.name.value];
            // This is a leaf
            // need to parse fragment definition at root and get the result here
        }
        // TODO: add checks for Kind.FRAGMENT_SPREAD and Kind.INLINE_FRAGMENT here
        return complexity;
    }

    selectionSetNode(
        node: SelectionSetNode,
        typeWeights: TypeWeightObject,
        variables: Variables,
        parentName: string
    ): number {
        let complexity = 0;
        // iterate shrough the 'selections' array on the seletion set node
        for (let i = 0; i < node.selections.length; i += 1) {
            // call the function to handle seletion nodes
            // pass the current parent through because selection sets act only as intermediaries
            complexity += this.selectionNode(
                node.selections[i],
                typeWeights,
                variables,
                parentName
            );
        }
        return complexity;
    }

    definitionNode(
        node: DefinitionNode,
        typeWeights: TypeWeightObject,
        variables: Variables
    ): number {
        // TODO: this is initialized with every call. Can we initialize per request
        // This needs to be cleared at the end of each request
        // Can we setup a callback or listener?
        const fragments: { [index: string]: number } = {};

        let complexity = 0;
        // check the kind property against the set of definiton nodes that are possible
        if (node.kind === Kind.OPERATION_DEFINITION) {
            // check if the operation is in the type weights object.
            if (node.operation.toLocaleLowerCase() in typeWeights) {
                // if it is, it is an object type, add it's type weight to the total
                complexity += typeWeights[node.operation].weight;
                // console.log(`the weight of ${node.operation} is ${complexity}`);
                // call the function to handle selection set node with selectionSet property if it is not undefined
                if (node.selectionSet) {
                    complexity += this.selectionSetNode(
                        node.selectionSet,
                        typeWeights,
                        variables,
                        node.operation
                    );
                }
            }
        } else if (node.kind === Kind.FRAGMENT_DEFINITION) {
            // Fragments can only be defined on the root type.
            // Parse the complexity of this fragment and store it for use when analyzing other
            // nodes. Only need to parse fragment complexity once
            // When analyzing the complexity of a query using a fragment the complexity of the
            // fragment should be added to the selection cost for the query.

            // interface FragmentDefinitionNode {
            //     readonly kind: Kind.FRAGMENT_DEFINITION;
            //     readonly loc?: Location;
            //     readonly name: NameNode;
            //     /** @deprecated variableDefinitions will be removed in v17.0.0 */
            //     readonly variableDefinitions?: ReadonlyArray<VariableDefinitionNode>;
            //     readonly typeCondition: NamedTypeNode;
            //     readonly directives?: ReadonlyArray<DirectiveNode>;
            //     readonly selectionSet: SelectionSetNode;
            // }
            // TODO: Handle variables or at least add tests for fragments containing variables
            const namedType = node.typeCondition.name.value;
            // Duplicate fragment names are now allowed by the GrapQL spec and an error is thrown if used.
            const fragmentName = node.name.value;
            if (this.fragmentCache[fragmentName]) return this.fragmentCache[fragmentName];

            const fragmentComplexity = this.selectionSetNode(
                node.selectionSet,
                typeWeights,
                variables,
                namedType.toLowerCase()
            );
            this.fragmentCache[fragmentName] = fragmentComplexity;
            return complexity; // 0. Don't count complexity here. Only when fragment is used.
        }
        // TODO: Verify that are no other type definition nodes that need to be handled (see ast.d.ts in 'graphql')
        return complexity;
    }

    documentNode(node: DocumentNode, typeWeights: TypeWeightObject, variables: Variables): number {
        let complexity = 0;
        // iterate through 'definitions' array on the document node
        // FIXME: create a copy to preserve original AST order if needed elsewhere
        const sortedDefinitions = [...node.definitions].sort((a, b) =>
            a.kind.localeCompare(b.kind)
        );
        for (let i = 0; i < sortedDefinitions.length; i += 1) {
            // call the function to handle the various types of definition nodes
            // FIXME: Need to parse fragment definitions first so that remaining complexity has access to query complexities
            complexity += this.definitionNode(sortedDefinitions[i], typeWeights, variables);
        }
        return complexity;
    }
}

export default ASTParser;
