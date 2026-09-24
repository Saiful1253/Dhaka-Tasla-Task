import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./providers/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#081A1F",
        "ink-elevated": "#102A30",
        paper: "#F4F0E6",
        porcelain: "#FFFDF7",
        lime: "#C7F36B",
        cyan: "#55DDE0",
        amber: "#F2B84B",
        coral: "#F26B5E",
      },
      boxShadow: {
        paper: "0 18px 50px rgba(8, 26, 31, 0.12)",
        glow: "0 0 0 1px rgba(199, 243, 107, 0.25), 0 18px 50px rgba(8, 26, 31, 0.2)",
      },
      keyframes: {
        "route-pulse": {
          "0%, 100%": { transform: "translateY(-2px)", opacity: "0" },
          "20%, 75%": { opacity: "1" },
          "50%": { transform: "translateY(28px)", opacity: "0.65" },
        },
        reveal: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "soft-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.48" },
        },
      },
      animation: {
        "route-pulse": "route-pulse 2.4s ease-in-out infinite",
        reveal: "reveal 500ms ease-out both",
        "soft-pulse": "soft-pulse 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
