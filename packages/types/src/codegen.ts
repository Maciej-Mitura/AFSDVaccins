import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  schema: '../api/dist/schema.gql',
  documents: ['../pwa/src/assets/graphql/**/*.ts'],
  overwrite: true,
  generates: {
    './dist/graphql.ts': {
      plugins: [
        'typescript',
        'typescript-operations',
        'typed-document-node',
      ],
      config: {
        useTypeImports: true,
        skipTypename: true,
      },
    },
  },
}

export default config
