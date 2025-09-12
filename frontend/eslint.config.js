// Flat config for ESLint 9
import js from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginImport from "eslint-plugin-import";
import prettier from "eslint-config-prettier";

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  { ignores: ["dist", "build", "node_modules"] },
  js.configs.recommended,
  {
    plugins: { react: pluginReact, "react-hooks": pluginReactHooks, import: pluginImport },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { localStorage: "readonly" },
    },
    settings: { react: { version: "detect" } },
    rules: {
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      ...pluginReact.configs.recommended.rules,
      ...pluginReactHooks.configs.recommended.rules,
      "import/order": ["warn", { "newlines-between": "always" }],
    },
  },
  prettier,
];
