import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "node_modules/**", "public/**", "scripts/.cache/**", "next-env.d.ts"],
  },
  {
    rules: {
      // R3F uses many custom JSX props (position, args, attach...).
      "react/no-unknown-property": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true, argsIgnorePattern: "^_" }],
    },
  },
  {
    // The render loop mutates Three.js objects (cameras, uniforms) every frame by design.
    files: ["game/**/*.tsx"],
    rules: { "react-hooks/immutability": "off" },
  },
];

export default config;
