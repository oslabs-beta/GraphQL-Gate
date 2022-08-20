import {
    DocumentNode,
    FieldNode,
    SelectionSetNode,
    DefinitionNode,
    Kind,
    DirectiveNode,
    SelectionNode,
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
 *                     /                |
 *  |-----> Selection Set Node  <-------|
 *  |               /
 *  |          Selection Node
 *  |  (Field,    Inline fragment, directives and fragment spread)
 *  |      |            |              \               \
 *  |  Field Node       |               \               \
 *  |      |            |       directiveCheck      fragmentCache
 *  |<--calculateCast   |
 *  |                   |
 *  |<------------------|
 */

class QueryParser {
    private typeWeights: TypeWeightObject;

    private depth: number;

    public maxDepth: number;

    private variables: Variables;

    private fragmentCache: { [index: string]: { complexity: number; depth: number } };

    constructor(typeWeights: TypeWeightObject, variables: Variables) {
        this.typeWeights = typeWeights;
        this.variables = variables;
        this.fragmentCache = {};
        this.depth = 0;
        this.maxDepth = 0;
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

        if (node.selectionSet) {
            selectionsCost += this.selectionSetNode(node.selectionSet, typeName);
        }
        // if there are arguments and this is a list, call the 'weightFunction' to get the weight of this field. otherwise the weight is static and can be accessed through the typeWeights object
        if (node.arguments && typeof typeWeight === 'function') {
            // FIXME: May never happen but what if weight is a function and arguments don't exist
            calculatedWeight += typeWeight([...node.arguments], this.variables, selectionsCost);
        } else if (typeof typeWeight === 'number') {
            calculatedWeight += typeWeight + selectionsCost;
        } else {
            calculatedWeight += this.typeWeights[typeName].weight + selectionsCost;
        }
        complexity += calculatedWeight;

        return complexity;
    }

    private fieldNode(node: FieldNode, parentName: string): number {
        try {
            let complexity = 0;
            // the node must have a parent in typeweights or the analysis will fail. this should never happen
            const parentType = this.typeWeights[parentName];
            if (!parentType) {
                throw new Error(
                    `ERROR: QueryParser Failed to obtain parentType for parent: ${parentName} and node: ${node.name.value}`
                );
            }

            let typeName: string | undefined;
            let typeWeight: FieldWeight | undefined;

            if (node.name.value === '__typename') return complexity; // this will be zero, ie. this field has no complexity

            if (node.name.value in this.typeWeights) {
                // node is an object type in the typeWeight root
                typeName = node.name.value;
                typeWeight = this.typeWeights[typeName].weight;
                complexity += this.calculateCost(node, parentName, typeName, typeWeight);
            } else if (parentType.fields[node.name.value].resolveTo) {
                // node is a field on a typeWeight root, field resolves to another type in type weights or a list
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
                        `ERROR: QueryParser Failed to obtain resolved type name or weight for node: ${parentName}.${node.name.value}`
                    );
                }
            } else {
                // field is a scalar
                typeName = node.name.value;
                if (typeName) {
                    typeWeight = parentType.fields[typeName].weight;
                    if (typeof typeWeight === 'number') {
                        complexity += typeWeight;
                    } else {
                        throw new Error(
                            `ERROR: QueryParser Failed to obtain type weight for ${parentName}.${node.name.value}`
                        );
                    }
                } else {
                    throw new Error(
                        `ERROR: QueryParser Failed to obtain type name for ${parentName}.${node.name.value}`
                    );
                }
            }
            return complexity;
        } catch (err) {
            throw new Error(
                `ERROR: QueryParser.fieldNode Uncaught error handling ${parentName}.${
                    node.name.value
                }\n
                ${err instanceof Error && err.stack}`
            );
        }
    }

    /**
     * Return true if:
     * 1. there is no directive skip or include
     * 2. there is a directive named inlcude and the value is true
     * 3. there is a directive named skip and the value is false
     */
    private directiveCheck(directives: DirectiveNode[]): boolean {
        // set the default of the return value of directiveCheck to true, reset to false if the directive include or skip is found with the argument is false or true respectively
        let directiveCheck = true;
        directives.forEach((directive) => {
            if (
                directive?.arguments &&
                (directive.name.value === 'include' || directive.name.value === 'skip')
            ) {
                // only consider the first argument
                const argument = directive.arguments[0];
                // ensure the argument name is 'if'
                const argumentHasVariables =
                    argument.value.kind === Kind.VARIABLE && argument.name.value === 'if';
                // access the value of the argument depending on whether it is passed as a variable or not
                let directiveArgumentValue;
                if (argument.value.kind === Kind.BOOLEAN) {
                    directiveArgumentValue = Boolean(argument.value.value);
                } else if (argumentHasVariables) {
                    directiveArgumentValue = Boolean(this.variables[argument.value.name.value]);
                }

                if (
                    (directive.name.value === 'include' && directiveArgumentValue !== true) ||
                    (directive.name.value === 'skip' && directiveArgumentValue !== false)
                ) {
                    directiveCheck = false;
                }
            }
        });
        return directiveCheck;
    }

    private selectionNode(node: SelectionNode, parentName: string): number {
        let complexity = 0;
        /**
         * process this node only if:
         * 1. there is no directive
         * 2. there is a directive named inlcude and the value is true
         * 3. there is a directive named skip and the value is false
         */
        if (node.directives && this.directiveCheck([...node.directives])) {
            this.depth += 1;
            if (this.depth > this.maxDepth) this.maxDepth = this.depth;
            // the kind of a field node will either be field, fragment spread or inline fragment
            if (node.kind === Kind.FIELD) {
                complexity += this.fieldNode(node, parentName.toLowerCase());
            } else if (node.kind === Kind.FRAGMENT_SPREAD) {
                // add complexity and depth from fragment cache
                const { complexity: fragComplexity, depth: fragDepth } =
                    this.fragmentCache[node.name.value];
                complexity += fragComplexity;
                this.depth += fragDepth;
                if (this.depth > this.maxDepth) this.maxDepth = this.depth;
                this.depth -= fragDepth;

                // This is a leaf
                // need to parse fragment definition at root and get the result here
            } else if (node.kind === Kind.INLINE_FRAGMENT) {
                const { typeCondition } = node;

                // named type is the type from which inner fields should be take
                // If the TypeCondition is omitted, an inline fragment is considered to be of the same type as the enclosing context
                const namedType = typeCondition
                    ? typeCondition.name.value.toLowerCase()
                    : parentName;

                // subtract 1 before, and add one after, entering the fragment selection to negate the additional level of depth added
                this.depth -= 1;
                complexity += this.selectionSetNode(node.selectionSet, namedType);
                this.depth += 1;
            } else {
                throw new Error(`ERROR: QueryParser.selectionNode: node type not supported`);
            }

            this.depth -= 1;
        }
        return complexity;
    }

    private selectionSetNode(node: SelectionSetNode, parentName: string): number {
        let complexity = 0;
        let maxFragmentComplexity = 0;
        for (let i = 0; i < node.selections.length; i += 1) {
            // pass the current parent through because selection sets act only as intermediaries
            const selectionNode = node.selections[i];
            const selectionCost = this.selectionNode(selectionNode, parentName);

            // we need to get the largest possible complexity so we save the largest inline fragment
            // e.g. ...UnionType and ...PartofTheUnion
            // this case these complexities should be summed in order to be accurate
            // However an estimation suffice
            // FIXME: Consider the case where 2 typed fragments are applicable
            if (selectionNode.kind === Kind.INLINE_FRAGMENT) {
                if (!selectionNode.typeCondition) {
                    // complexity is always applicable
                    complexity += selectionCost;
                } else if (selectionCost > maxFragmentComplexity)
                    maxFragmentComplexity = selectionCost;
            } else {
                complexity += selectionCost;
            }
        }
        return complexity + maxFragmentComplexity;
    }

    private definitionNode(node: DefinitionNode): number {
        let complexity = 0;
        // Operation definition is either query, mutation or subscripiton
        if (node.kind === Kind.OPERATION_DEFINITION) {
            if (node.operation.toLocaleLowerCase() in this.typeWeights) {
                complexity += this.typeWeights[node.operation].weight;
                if (node.selectionSet) {
                    complexity += this.selectionSetNode(node.selectionSet, node.operation);
                }
            }
        } else if (node.kind === Kind.FRAGMENT_DEFINITION) {
            // Fragments can only be defined on the root type.
            // Parse the complexity of this fragment once and store it for use when analyzing other nodes
            const namedType = node.typeCondition.name.value;
            // Duplicate fragment names are not allowed by the GraphQL spec and an error is thrown if used.
            const fragmentName = node.name.value;

            const fragmentComplexity = this.selectionSetNode(
                node.selectionSet,
                namedType.toLowerCase()
            );

            // Don't count fragment complexity in the node's complexity. Only when fragment is used.
            this.fragmentCache[fragmentName] = {
                complexity: fragmentComplexity,
                depth: this.maxDepth - 1, // subtract one from the calculated depth of the fragment to correct for the additional depth the fragment adds to the query when used
            };
        }
        // TODO: Verify that there are no other type definition nodes that need to be handled (see ast.d.ts in 'graphql')
        // else {
        //
        //     // Other types include TypeSystemDefinitionNode (Schema, Type, Directvie) and
        //     // TypeSystemExtensionNode(Schema, Type);
        //     throw new Error(`ERROR: QueryParser.definitionNode: ${node.kind} type not supported`);
        // }
        return complexity;
    }

    private documentNode(node: DocumentNode): number {
        let complexity = 0;
        // Sort the definitions array by kind so that fragments are always parsed first.
        // Fragments must be parsed first so that their complexity is available to other nodes.
        const sortedDefinitions = [...node.definitions].sort((a, b) =>
            a.kind.localeCompare(b.kind)
        );
        for (let i = 0; i < sortedDefinitions.length; i += 1) {
            complexity += this.definitionNode(sortedDefinitions[i]);
        }
        return complexity;
    }

    public processQuery(queryAST: DocumentNode): number {
        return this.documentNode(queryAST);
    }
}

export default QueryParser;
