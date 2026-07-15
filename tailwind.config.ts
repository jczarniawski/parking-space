import type { Config } from "tailwindcss";

// Match-Trade Technologies inspired palette.
// `brand`  – deep corporate navy (headers, nav, primary surfaces)
// `accent` – crimson red (primary actions, FAB, highlights)
// If you have the exact brand hex values, swap them here — the whole UI
// derives from these two scales.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f5fa",
          100: "#e2e9f3",
          200: "#c6d4e8",
          300: "#9db4d5",
          400: "#6d8ebd",
          500: "#4b70a6",
          600: "#39588b",
          700: "#2f4771",
          800: "#2a3d5e",
          900: "#1c2a44",
          950: "#0e1830",
        },
        accent: {
          50: "#fef2f3",
          100: "#fde3e6",
          200: "#fbccd2",
          300: "#f7a3ae",
          400: "#f27083",
          500: "#e8405c",
          600: "#d42045",
          700: "#b21539",
          800: "#951437",
          900: "#801535",
          950: "#470618",
        },
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(15 24 48 / 0.08), 0 1px 2px -1px rgb(15 24 48 / 0.08)",
        fab: "0 8px 20px -6px rgb(212 32 69 / 0.5)",
      },
    },
  },
  plugins: [],
};

export default config;
