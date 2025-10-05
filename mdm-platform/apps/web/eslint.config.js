import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const projectSettings = {
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
      project: ["./tsconfig.json"],
      sourceType: "module"
    },
    globals: {
      ...globals.browser,
      ...globals.node
    }
  }
};

export default [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "**/*.config.{js,ts,mjs,cjs}",
      "**/tailwind.config.{js,ts}",
      "**/postcss.config.{js,ts}"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx,js,jsx}", "app/**/*.{ts,tsx,js,jsx}"],
    ...projectSettings,
    rules: {
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_"
        }
      ]
    }
  }
];
