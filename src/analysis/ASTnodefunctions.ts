import {
    DocumentNode,
    FieldNode,
    SelectionSetNode,
    DefinitionNode,
    Kind,
    SelectionNode,
    NamedTypeNode,
} from 'graphql';
import { FieldWeight, TypeWeightObject, Variables } from '../@types/buildTypeWeights';
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
    typeWeights: TypeWeightObject;

    variables: Variables;

    fragmentCache: { [index: string]: number };

    constructor(typeWeights: TypeWeightObject, variables: Variables) {
        this.typeWeights = typeWeights;
        this.variables = variables;
        this.fragmentCache = {};
    }

    private calculateCost(
        node: FieldNode,
        parentName: string,
        typeName: string,
        typeWeight: FieldWeight
    ) {
        let complexity = 0;
        // field resolves to an object or a list with possible selections
        let selectionsCost = 0;
        let calculatedWeight = 0;

        // call the function to handle selection set node with selectionSet property if it is not undefined
        if (node.selectionSet) {
            selectionsCost += this.selectionSetNode(node.selectionSet, typeName);
        }
        // if there are arguments and this is a list, call the 'weightFunction' to get the weight of this field. otherwise the weight is static and can be accessed through the typeWeights object
        if (node.arguments && typeof typeWeight === 'function') {
            // FIXME: May never happen but what if weight is a function and arguments don't exist
            calculatedWeight += typeWeight([...node.arguments], this.variables, selectionsCost);
        } else {
            calculatedWeight += this.typeWeights[typeName].weight + selectionsCost;
        }
        complexity += calculatedWeight;

        return complexity;
    }

    fieldNode(node: FieldNode, parentName: string): number {
        let complexity = 0;
        const parentType = this.typeWeights[parentName];
        if (!parentType) {
            throw new Error(
                `ERROR: ASTParser Failed to obtain parentType for parent: ${parentName} and node: ${node.name.value}`
            );
        }
        let typeName: string | undefined;
        let typeWeight: FieldWeight | undefined;

        if (node.name.value in this.typeWeights) {
            // node is an object type n the typeWeight root
            typeName = node.name.value;
            typeWeight = this.typeWeights[typeName].weight;
            complexity += this.calculateCost(node, parentName, typeName, typeWeight);
        } else if (parentType.fields[node.name.value].resolveTo) {
            // field resolves to another type in type weights or a list
            typeName = parentType.fields[node.name.value].resolveTo;
            typeWeight = parentType.fields[node.name.value].weight;
            // if this is a list typeWeight is a weight function
            // otherwise the weight would be null as the weight is defined on the typeWeights root
            if (typeName && typeWeight) {
                // Type is a list and has a weight function
                complexity += this.calculateCost(node, parentName, typeName, typeWeight);
            } else if (typeName) {
                // resolve type exists at root of typeWeight object and is not a list
                typeWeight = this.typeWeights[typeName].weight;
                complexity += this.calculateCost(node, parentName, typeName, typeWeight);
            } else {
                throw new Error(
                    `ERROR: ASTParser Failed to obtain resolved type name or weight for node: ${parentName}.${node.name.value}`
                );
            }
        } else {
            // field is a scalar
            typeName = node.name.value;
            if (typeName) {
                typeWeight = this.typeWeights[parentName].fields[typeName].weight;
                if (typeof typeWeight === 'number') {
                    complexity += typeWeight;
                } else {
                    throw new Error(
                        `ERROR: ASTParser Failed to obtain type weight for ${parentName}.${node.name.value}`
                    );
                }
            } else {
                throw new Error(
                    `ERROR: ASTParser Failed to obtain type name for ${parentName}.${node.name.value}`
                );
            }
        }
        return complexity;
    }

    selectionNode(node: SelectionNode, parentName: string): number {
        let complexity = 0;
        // check the kind property against the set of selection nodes that are possible
        if (node.kind === Kind.FIELD) {
            // call the function that handle field nodes
            complexity += this.fieldNode(node, parentName.toLowerCase());
        } else if (node.kind === Kind.FRAGMENT_SPREAD) {
            complexity += this.fragmentCache[node.name.value];
            // This is a leaf
            // need to parse fragment definition at root and get the result here
        } else if (node.kind === Kind.INLINE_FRAGMENT) {
            // export interface InlineFragmentNode {
            //     readonly kind: Kind.INLINE_FRAGMENT;
            //     readonly loc?: Location;
            //     readonly typeCondition?: NamedTypeNode;
            //     readonly directives?: ReadonlyArray<DirectiveNode>;
            //     readonly selectionSet: SelectionSetNode;
            // }

            // FIXME: When would typeConditoin not be present?
            const { typeCondition } = node;
            if (!typeCondition) {
                throw new Error(
                    'ERROR: ASTParser.selectionNode: Inline Fragment missing type condition'
                );
            }
            // named type is the type from which inner fields should be take
            complexity += this.selectionSetNode(
                node.selectionSet,
                typeCondition.name.value.toLowerCase()
            );
        } else {
            // FIXME: Consider removing this check. SelectionNodes cannot have any other kind in the current spec.
            throw new Error(`ERROR: ASTParser.selectionNode: node type not supported`);
        }
        return complexity;
    }

    selectionSetNode(node: SelectionSetNode, parentName: string): number {
        let complexity = 0;
        // iterate shrough the 'selections' array on the seletion set node
        for (let i = 0; i < node.selections.length; i += 1) {
            // call the function to handle seletion nodes
            // pass the current parent through because selection sets act only as intermediaries
            complexity += this.selectionNode(node.selections[i], parentName);
        }
        return complexity;
    }

    definitionNode(node: DefinitionNode): number {
        let complexity = 0;
        // check the kind property against the set of definiton nodes that are possible
        if (node.kind === Kind.OPERATION_DEFINITION) {
            // check if the operation is in the type weights object.
            if (node.operation.toLocaleLowerCase() in this.typeWeights) {
                // if it is, it is an object type, add it's type weight to the total
                complexity += this.typeWeights[node.operation].weight;
                // console.log(`the weight of ${node.operation} is ${complexity}`);
                // call the function to handle selection set node with selectionSet property if it is not undefined
                if (node.selectionSet) {
                    complexity += this.selectionSetNode(node.selectionSet, node.operation);
                }
            }
        } else if (node.kind === Kind.FRAGMENT_DEFINITION) {
            // Fragments can only be defined on the root type.
            // Parse the complexity of this fragment once and store it for use when analyzing other
            // nodes. The complexity of a fragment can be added to the selection cost for the query.
            const namedType = node.typeCondition.name.value;
            // Duplicate fragment names are not allowed by the GraphQL spec and an error is thrown if used.
            const fragmentName = node.name.value;

            if (this.fragmentCache[fragmentName]) return this.fragmentCache[fragmentName];

            const fragmentComplexity = this.selectionSetNode(
                node.selectionSet,
                namedType.toLowerCase()
            );

            this.fragmentCache[fragmentName] = fragmentComplexity;
            return complexity; // Don't count complexity here. Only when fragment is used.
        } else {
            // TODO: Verify that are no other type definition nodes that need to be handled (see ast.d.ts in 'graphql')
            // Other types include TypeSystemDefinitionNode (Schema, Type, Directvie) and
            // TypeSystemExtensionNode(Schema, Type);
            throw new Error(`ERROR: ASTParser.definitionNode: ${node.kind} type not supported`);
        }
        return complexity;
    }

    documentNode(node: DocumentNode): number {
        let complexity = 0;
        // iterate through 'definitions' array on the document node
        // FIXME: create a copy to preserve original AST order if needed elsewhere
        const sortedDefinitions = [...node.definitions].sort((a, b) =>
            a.kind.localeCompare(b.kind)
        );
        for (let i = 0; i < sortedDefinitions.length; i += 1) {
            // call the function to handle the various types of definition nodes
            // FIXME: Need to parse fragment definitions first so that remaining complexity has access to query complexities
            complexity += this.definitionNode(sortedDefinitions[i]);
        }
        return complexity;
    }
}

export default ASTParser;
