import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Alias to the same emerald scale already used for the "FinanceOS"
        // wordmark and approve/good states (src/components/ui.tsx, Nav.tsx) —
        // several pages reference `brand-*` without this, so those utility
        // classes silently generated no CSS (invisible buttons/text).
        brand: colors.emerald,
      },
    },
  },
  plugins: [],
};
export default config;
