import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm coral/terracotta accent, in the spirit of Claude's brand.
        brand: {
          50: "#FDF3F0",
          100: "#FBE4DC",
          200: "#F5C6B3",
          300: "#EBA285",
          500: "#D97757",
          600: "#C05F3E",
          700: "#9C4A30",
        },
        cream: {
          DEFAULT: "#F5F3EE",
          100: "#FAF9F5",
        },
        ink: {
          DEFAULT: "#3D3929",
          light: "#6B6656",
        },
      },
      fontFamily: {
        serif: ["var(--font-display)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
