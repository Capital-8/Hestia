import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', 'node_modules/**', 'test-results/**', 'tests/e2e/**', 'scripts/**', 'docs/revit_ui_reference/**', 'docs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // docs/01 §9: arquivos pequenos. Testes ficam de fora.
      'max-lines': ['error', { max: 420, skipBlankLines: true, skipComments: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': ['error', { selector: "CallExpression[callee.name='eval']", message: 'eval é proibido.' }],
    },
  },
  { files: ['**/*.test.ts'], rules: { 'max-lines': 'off' } },
  // Gerado a partir de crates/geom-wasm/schema/cena-v*.json (scripts/gerar-esquema-kernel.mjs): cresce com o esquema.
  { files: ['**/*.gerado.ts'], rules: { 'max-lines': 'off' } },
);
