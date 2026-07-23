import type { ApolloServerPlugin } from '@apollo/server'
import {
  createComplexityRule,
  getComplexity,
  simpleEstimator,
} from 'graphql-query-complexity'
import {
  GraphQLError,
  Kind,
  type DocumentNode,
  type FragmentDefinitionNode,
  type GraphQLSchema,
  type SelectionNode,
  type ValidationContext,
  type ValidationRule,
} from 'graphql'

export const GRAPHQL_DEPTH_EXCEEDED_CODE = 'GRAPHQL_DEPTH_EXCEEDED'
export const GRAPHQL_COMPLEXITY_EXCEEDED_CODE = 'GRAPHQL_COMPLEXITY_EXCEEDED'

function isIntrospectionName(name: string): boolean {
  return name.startsWith('__')
}

function collectFragments(
  context: ValidationContext,
): Map<string, FragmentDefinitionNode> {
  const map = new Map<string, FragmentDefinitionNode>()
  for (const definition of context.getDocument().definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      map.set(definition.name.value, definition)
    }
  }
  return map
}

function selectionDepth(
  selection: SelectionNode,
  fragments: Map<string, FragmentDefinitionNode>,
  currentDepth: number,
  maxDepth: number,
  visitedFragments: Set<string>,
  context: ValidationContext,
): void {
  if (selection.kind === Kind.FIELD) {
    if (isIntrospectionName(selection.name.value)) {
      return
    }

    const nextDepth = currentDepth + 1
    if (nextDepth > maxDepth) {
      context.reportError(
        new GraphQLError(`Query exceeds maximum depth of ${maxDepth}.`, {
          nodes: selection,
          extensions: { code: GRAPHQL_DEPTH_EXCEEDED_CODE },
        }),
      )
      return
    }

    if (selection.selectionSet) {
      for (const child of selection.selectionSet.selections) {
        selectionDepth(
          child,
          fragments,
          nextDepth,
          maxDepth,
          visitedFragments,
          context,
        )
      }
    }
    return
  }

  if (selection.kind === Kind.INLINE_FRAGMENT) {
    for (const child of selection.selectionSet.selections) {
      selectionDepth(
        child,
        fragments,
        currentDepth,
        maxDepth,
        visitedFragments,
        context,
      )
    }
    return
  }

  if (selection.kind === Kind.FRAGMENT_SPREAD) {
    const spread = selection
    if (visitedFragments.has(spread.name.value)) {
      return
    }
    const fragment = fragments.get(spread.name.value)
    if (!fragment) {
      return
    }
    visitedFragments.add(spread.name.value)
    for (const child of fragment.selectionSet.selections) {
      selectionDepth(
        child,
        fragments,
        currentDepth,
        maxDepth,
        visitedFragments,
        context,
      )
    }
  }
}

/**
 * Auditable max-depth validation (fragments + aliases supported; introspection skipped).
 */
export function createMaxDepthRule(maxDepth: number): ValidationRule {
  return (context) => {
    const fragments = collectFragments(context)

    return {
      OperationDefinition(operation) {
        const visitedFragments = new Set<string>()
        for (const selection of operation.selectionSet.selections) {
          selectionDepth(
            selection,
            fragments,
            0,
            maxDepth,
            visitedFragments,
            context,
          )
        }
      },
    }
  }
}

export function estimateQueryComplexity(
  schema: GraphQLSchema,
  query: DocumentNode,
  variables?: Record<string, unknown> | null,
): number {
  return getComplexity({
    estimators: [
      (args) => {
        if (isIntrospectionName(args.field.name)) {
          return 0
        }
        return simpleEstimator({ defaultComplexity: 1 })(args)
      },
    ],
    schema,
    query,
    variables: variables ?? undefined,
  })
}

/**
 * Apollo plugin: enforce complexity after variables are available.
 * Nest `validationRules: [createComplexityRule(...)]` broke GraphQL variable
 * delivery for mutations in this Apollo/Nest stack; the plugin path is safe.
 */
export function createComplexityApolloPlugin(
  maxComplexity: number,
): ApolloServerPlugin {
  return {
    requestDidStart() {
      return Promise.resolve({
        didResolveOperation(requestContext) {
          const { schema, document, request } = requestContext
          if (!document) {
            return Promise.resolve()
          }

          const complexity = estimateQueryComplexity(
            schema,
            document,
            request.variables ?? undefined,
          )

          if (complexity > maxComplexity) {
            throw new GraphQLError(
              `Query exceeds maximum complexity of ${maxComplexity} (actual ${complexity}).`,
              {
                extensions: {
                  code: GRAPHQL_COMPLEXITY_EXCEEDED_CODE,
                },
              },
            )
          }

          return Promise.resolve()
        },
      })
    },
  }
}

export function buildGraphqlDepthValidationRules(options: {
  maxDepth: number
}): ValidationRule[] {
  return [createMaxDepthRule(options.maxDepth)]
}

/** Unit-test helper composing depth rule + complexity validation rule. */
export function buildGraphqlQueryProtectionRules(options: {
  maxDepth: number
  maxComplexity: number
}): ValidationRule[] {
  const complexityRule = createComplexityRule({
    maximumComplexity: options.maxComplexity,
    estimators: [
      (args) => {
        if (isIntrospectionName(args.field.name)) {
          return 0
        }
        return simpleEstimator({ defaultComplexity: 1 })(args)
      },
    ],
    createError: (max: number, actual: number) =>
      new GraphQLError(
        `Query exceeds maximum complexity of ${max} (actual ${actual}).`,
        {
          extensions: {
            code: GRAPHQL_COMPLEXITY_EXCEEDED_CODE,
          },
        },
      ),
  })

  return [createMaxDepthRule(options.maxDepth), complexityRule]
}
