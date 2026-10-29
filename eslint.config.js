import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['**/node_modules/**', 'client/dist/**', '.local/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['client/src/**/*.jsx'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    settings: { react: { version: 'detect' } },
    rules: { ...react.configs.recommended.rules, ...reactHooks.configs.recommended.rules, 'react/react-in-jsx-scope': 'off' },
  },
];
