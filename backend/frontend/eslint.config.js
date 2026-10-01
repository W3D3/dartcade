// Strict, type-aware linting: no type assertions, no any, no non-null assertions.
import tseslint from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'

export default tseslint.config(
  { ignores: ["dist/**", "src/lib/api/schema.ts", "src/lib/api/game-ws.ts", "src/lib/api/zod.ts", "eslint.config.js"] },
  ...tseslint.configs.strictTypeChecked,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname, extraFileExtensions: ['.svelte'] },
    },
  },
  { files: ['**/*.svelte', '**/*.svelte.ts'], languageOptions: { parserOptions: { parser: tseslint.parser } } },
  {
    rules: {
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      // Leading underscore marks a deliberately unused name (e.g. `{#each list as _, i}`)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    rules: {
      // Svelte syntax the TypeScript rules misread: `{@render snippet()}` and `prop = $bindable()`
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-useless-default-assignment': 'off',
    },
  },
  {
    // Every component has a TypeScript script block, so svelte-check type-checks its
    // template too (a component without one once rendered an unimported <BrandMark>)
    files: ['**/*.svelte'],
    rules: {
      'svelte/block-lang': ['error', { enforceScriptPresent: true, script: 'ts', style: null }],
    },
  },
  {
    // Tests may cast and use any to build partial fixtures
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
)
