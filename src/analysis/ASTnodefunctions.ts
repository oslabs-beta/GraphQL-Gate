/* eslint-disable @typescript-eslint/no-use-before-define */
import {
    DocumentNode,
    FieldNode,
    SelectionSetNode,
    DefinitionNode,
    Kind,
    SelectionNode,
    ArgumentNode,
} from 'graphql';
import { FieldWeight, TypeWeightObject } from '../@types/buildTypeWeights';

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

export function fieldNode(
    node: FieldNode,
    typeWeights: TypeWeightObject,
    variables: any | undefined,
    parentName: string
): number {
    let complexity = 0;
    // check if the field name is in the type weight object.
    if (node.name.value.toLocaleLowerCase() in typeWeights) {
        // if it is, than the field is an object type, add itss type weight to the total
        complexity += typeWeights[node.name.value].weight;
        // call the function to handle selection set node with selectionSet property if it is not undefined
        if (node.selectionSet) {
            complexity += selectionSetNode(
                node.selectionSet,
                typeWeights,
                variables,
                node.name.value
            );
        }
    } else {
        // otherwise the field is a scalar or a list.
        const fieldWeight: FieldWeight = typeWeights[parentName].fields[node.name.value];
        if (typeof fieldWeight === 'number') {
            // if the field weight is a number, add the number to the total complexity
            complexity += fieldWeight;
        } else if (node.arguments) {
            // otherwise the the field weight is a list, invoke the function with variables
            // TODO: calculate the complexity for lists with arguments and varibales
            complexity += fieldWeight([...node.arguments], variables[node.name.value]);
        }
    }
    return complexity;
}

export function selectionNode(
    node: SelectionNode,
    typeWeights: TypeWeightObject,
    variables: any | undefined,
    parentName: string
): number {
    let complexity = 0;
    let calculatedCost = 0;
    // check the kind property against the set of selection nodes that are possible
    if (node.kind === Kind.FIELD) {
        // call the function that handle field nodes
        calculatedCost += fieldNode(node, typeWeights, variables, parentName);

        if (calculatedCost !== 0) complexity *= calculatedCost;
    }
    // TODO: add checks for Kind.FRAGMENT_SPREAD and Kind.INLINE_FRAGMENT here
    return complexity;
}

export function selectionSetNode(
    node: SelectionSetNode,
    typeWeights: TypeWeightObject,
    variables: any | undefined,
    parentName: string
): number {
    let complexity = 0;
    // iterate shrough the 'selections' array on the seletion set node
    for (let i = 0; i < node.selections.length; i += 1) {
        // call the function to handle seletion nodes
        // pass the current parent through because selection sets act only as intermediaries
        complexity += selectionNode(node.selections[i], typeWeights, variables, parentName);
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
                complexity += selectionSetNode(
                    node.selectionSet,
                    typeWeights,
                    variables,
                    node.operation
                );
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
    for (let i = 0; i < node.definitions.length; i += 1) {
        // call the function to handle the various types of definition nodes
        complexity += definitionNode(node.definitions[i], typeWeights, variables);
    }
    return complexity;
}
