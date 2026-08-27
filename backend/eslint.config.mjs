import js from "@eslint/js"

export default [
  { ignores: ["dist/**"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        // Node built-ins
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
    rules: {
      "no-console": "off", // optional if you want console logs
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }], // ignore _next
    },
  },
]