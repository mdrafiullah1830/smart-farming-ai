// ESLint 10 dropped `.eslintrc*` support in favour of flat config. The rules
// below are the same ones the old `.eslintrc.cjs` expressed:
//   - globals: the browser/node/es2022 environments the pages and scripts run in,
//     which the `globals` package enumerates by version.
//   - ignorePatterns: `bd_districts.js` is a generated shared data bundle in both
//     the desktop and mobile trees. Its top-level helper functions are consumed
//     by page scripts loaded as plain <script> tags, so ESLint cannot see the
//     references and would otherwise report every helper as unused.
//   - rules: unchanged from the previous config.
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // The build output, installed packages and the dev server are not our code.
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/**',
      'server.js',
      'server.cjs',
      'web/bd_districts.js',
      'mobile/bd_districts.js',
    ],
  },
  {
    // Test files run under Node.
    files: ['**/*.test.js', '**/*.spec.js', 'tests/**'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
