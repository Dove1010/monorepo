import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'

const noLogProcessEnvPlugin = {
  rules: {
    'no-log-process-env': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow logging process.env to avoid secret leakage',
        },
        schema: [],
      },
      create(context) {
        const logMethodNames = new Set([
          'log',
          'info',
          'debug',
          'warn',
          'error',
          'trace',
          'fatal',
        ])

        function containsProcessEnv(node) {
          if (!node) return false

          if (
            node.type === 'MemberExpression' &&
            !node.computed &&
            node.object?.type === 'Identifier' &&
            node.object.name === 'process' &&
            node.property?.type === 'Identifier' &&
            node.property.name === 'env'
          ) {
            return true
          }

          if (
            node.type === 'MemberExpression' &&
            containsProcessEnv(node.object)
          ) {
            return true
          }

          if (
            node.type === 'ChainExpression' &&
            containsProcessEnv(node.expression)
          ) {
            return true
          }

          if (node.type === 'CallExpression') {
            if (containsProcessEnv(node.callee)) return true
            return node.arguments.some((arg) => containsProcessEnv(arg))
          }

          if (node.type === 'TemplateLiteral') {
            return node.expressions.some((expr) => containsProcessEnv(expr))
          }

          if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
            return containsProcessEnv(node.left) || containsProcessEnv(node.right)
          }

          if (node.type === 'ConditionalExpression') {
            return (
              containsProcessEnv(node.test) ||
              containsProcessEnv(node.consequent) ||
              containsProcessEnv(node.alternate)
            )
          }

          if (node.type === 'ArrayExpression') {
            return node.elements.some((el) => el && containsProcessEnv(el))
          }

          if (node.type === 'ObjectExpression') {
            return node.properties.some((prop) => {
              if (prop.type === 'Property') {
                return containsProcessEnv(prop.value)
              }

              if (prop.type === 'SpreadElement') {
                return containsProcessEnv(prop.argument)
              }

              return false
            })
          }

          if (node.type === 'UnaryExpression' || node.type === 'UpdateExpression') {
            return containsProcessEnv(node.argument)
          }

          if (node.type === 'AwaitExpression' || node.type === 'SpreadElement') {
            return containsProcessEnv(node.argument)
          }

          if (node.type === 'SequenceExpression') {
            return node.expressions.some((expr) => containsProcessEnv(expr))
          }

          if (node.type === 'NewExpression') {
            return node.arguments?.some((arg) => containsProcessEnv(arg)) ?? false
          }

          return false
        }

        function isLoggingCall(callee) {
          if (!callee) return false

          if (callee.type === 'MemberExpression') {
            if (callee.computed) return false
            if (callee.property.type !== 'Identifier') return false
            return logMethodNames.has(callee.property.name)
          }

          return false
        }

        return {
          CallExpression(node) {
            if (!isLoggingCall(node.callee)) return
            if (!node.arguments?.length) return
            if (!node.arguments.some((arg) => containsProcessEnv(arg))) return

            context.report({
              node,
              message:
                'Do not log process.env (or derived values). This can leak secrets into logs.',
            })
          },
        }
      },
    },
  },
}

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 'latest',
      parser: tsParser,
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'shelterflex-security': noLogProcessEnvPlugin,
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'shelterflex-security/no-log-process-env': 'error',
    },
  },
  {
    files: ['src/routes/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'node:crypto',
              message: 'Decrypt or sign in CustodialWalletService only',
            },
            {
              name: 'crypto',
              message: 'Decrypt or sign in CustodialWalletService only',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['dist/**', 'examples/**', 'node_modules/**'],
  },
];
