import js from "@eslint/js";
import tseslint from "typescript-eslint";
import next from "@next/eslint-plugin-next";
export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { plugins: { "@next/next": next } },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      ...next.configs.recommended.rules,
      // Provider images load in the browser; do not fetch arbitrary catalog URLs on the server.
      "@next/next/no-img-element": "off",
      // Storefront links intentionally reset cart/dialog state with a full navigation.
      "@next/next/no-html-link-for-pages": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);
