module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  // `bd_districts.js` is a generated shared data bundle in both the desktop and
// mobile trees. Its top-level helper functions are consumed by page scripts
// loaded as plain <script> tags, so ESLint cannot see the references and would
// otherwise report every helper as unused.
ignorePatterns: [
    'dist/**',
    'node_modules/**',
    'public/**',
    'server.js',
    'server.cjs',
    'web/bd_districts.js',
    'mobile/bd_districts.js',
  ],
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-console': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
  overrides: [
    {
      files: ['**/*.test.js', '**/*.spec.js', 'tests/**'],
      env: { node: true },
    },
  ],
};
