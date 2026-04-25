import nextPlugin from "@next/eslint-plugin-next";
import eslintComments from "eslint-plugin-eslint-comments";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";
import unicorn from "eslint-plugin-unicorn";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "test-results/**",
      "src/types/supabase.ts",
      "tests/e2e/**/*-snapshots/**",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@next/next": nextPlugin,
      "eslint-comments": eslintComments,
      import: importPlugin,
      "jsx-a11y": jsxA11y,
      "react-hooks": reactHooks,
      sonarjs: sonarjs,
      unicorn: unicorn,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,
      "sonarjs/cognitive-complexity": ["error", 15],
      "sonarjs/no-duplicate-string": ["error", { threshold: 3 }],
      "sonarjs/no-identical-functions": "error",
      "sonarjs/no-collapsible-if": "error",
      "sonarjs/no-redundant-jump": "error",
      "eslint-comments/no-unused-disable": "error",
      "import/no-cycle": ["error", { maxDepth: 1 }],
      "import/no-duplicates": "error",
      "import/order": [
        "error",
        {
          groups: [
            ["builtin", "external"],
            "internal",
            ["parent", "sibling", "index"],
            "object",
            "type",
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
          pathGroups: [{ pattern: "@/**", group: "internal" }],
          pathGroupsExcludedImportTypes: ["builtin"],
        },
      ],
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "react-hooks/set-state-in-effect": "off",
      complexity: ["error", 10],
      "max-lines-per-function": [
        "error",
        { max: 100, skipBlankLines: true, skipComments: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "unicorn/filename-case": [
        "warn",
        {
          cases: {
            kebabCase: true,
            camelCase: true,
            pascalCase: true,
          },
          ignore: ["^utils\\.ts$"],
        },
      ],
      "unicorn/prefer-module": "error",
      "unicorn/prevent-abbreviations": "off",
    },
  },
);
