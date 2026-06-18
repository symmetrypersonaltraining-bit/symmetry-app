import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Steel + Sky — Symmetry Personal Training brand
        brand: {
          bg: "#EDF2F7",
          surface: "#FFFFFF",
          card: "#DDEEFF",
          primary: "#0F4C81",
          accent: "#0EA5E9",
          text: "#0D1B2E",
          "text-secondary": "#4E6080",
          border: "#C8D8EC",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
