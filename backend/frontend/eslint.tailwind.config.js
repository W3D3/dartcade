// Tailwind class rules only, no type information, so it can run on its own (npm run lint:tw).
// The classes it rewrites are auto-fixable: `npm run lint:tw -- --fix`.
import svelte from 'eslint-plugin-svelte'
import tailwind from 'eslint-plugin-better-tailwindcss'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['dist/**', 'src/lib/api/**'] },
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  ...svelte.configs.base,
  { files: ['**/*.svelte', '**/*.svelte.ts'], languageOptions: { parserOptions: { parser: tseslint.parser } } },
  { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
  {
    files: ['**/*.svelte', '**/*.ts'],
    // Registered only so `eslint-disable @typescript-eslint/...` comments in the files resolve.
    plugins: { 'better-tailwindcss': tailwind, '@typescript-eslint': tseslint.plugin },
    settings: { 'better-tailwindcss': { entryPoint: 'src/app.css' } },
    rules: {
      // Arbitrary values that equal a theme token (rounded-[9px] -> rounded-key), x/y pairs -> size-*, ...
      'better-tailwindcss/enforce-canonical-classes': 'error',
      'better-tailwindcss/no-deprecated-classes': 'error',
      'better-tailwindcss/no-conflicting-classes': 'error',
      'better-tailwindcss/no-duplicate-classes': 'error',
    },
  },
]
