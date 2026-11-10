import js from "@eslint/js";
import globals from "globals";
export default [
  { ignores: ["dist/**", "node_modules/**"] },
  {
    files: ["server/**/*.mjs", "scripts/**/*.mjs", "tests/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
