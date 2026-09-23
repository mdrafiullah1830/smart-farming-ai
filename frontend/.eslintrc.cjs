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
  ignorePatterns: ['dist/**', 'node_modules/**', 'public/**', 'server.js', 'server.cjs', 'web/bd_districts.js'],
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
