import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        seal: { DEFAULT: "#1E5B3C", 2: "#2E7D5B", deep: "#123A26" },
        brass: "#B07A18",
        flag: "#A6222E",
        paper: "#EEF0EA",
        ink: "#101A15",
        rule: "#D3D8D1",
        wash: "#F5F7F3",
      },
      fontFamily: {
        display: ["Archivo", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
