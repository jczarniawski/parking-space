import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9eaff",
          200: "#bcdbff",
          300: "#8ec4ff",
          400: "#59a3ff",
          500: "#337fff",
          600: "#1b5ff5",
          700: "#144ae1",
          800: "#173db6",
          900: "#19388f",
          950: "#142357",
        },
      },
    },
  },
  plugins: [],
};

export default config;
