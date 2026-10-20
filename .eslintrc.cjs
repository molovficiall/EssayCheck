module.exports = {
  root: true,
  env: { es2022: true, browser: true, node: true },
  extends: ["eslint:recommended"],
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  ignorePatterns: ["public/assets/brand/favicon/*.png", "public/assets/brand/favicon/*.ico"],
  rules: { "no-unused-vars": ["error", { argsIgnorePattern: "^_" }] }
};
