import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        surface2: "var(--surface-2)",
        border: "var(--border)",
        ink: "var(--text)",
        ink2: "var(--text-2)",
        accent: "var(--accent)",
        accentInk: "var(--accent-ink)",
        grupal: "var(--grupal)",
        dosuno: "var(--dosuno)",
        tresuno: "var(--tresuno)",
        success: "var(--success)",
        successBg: "var(--success-bg)",
        warning: "var(--warning)",
        warningBg: "var(--warning-bg)",
        danger: "var(--danger)",
        dangerBg: "var(--danger-bg)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
    },
  },
  plugins: [],
};

export default config;
