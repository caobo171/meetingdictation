import type { Config } from 'tailwindcss';

// Same family as WELE: warm paper, deep ink, rounded cards. Our own accent is indigo.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        bg2: 'rgb(var(--bg2) / <alpha-value>)',
        paper: 'rgb(var(--paper) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: { DEFAULT: 'rgb(var(--ink) / <alpha-value>)', 2: 'rgb(var(--ink-2) / <alpha-value>)', 3: 'rgb(var(--ink-3) / <alpha-value>)' },
        brand: { DEFAULT: 'rgb(var(--brand) / <alpha-value>)', deep: 'rgb(var(--brand-deep) / <alpha-value>)', soft: 'rgb(var(--brand-soft) / <alpha-value>)' },
        gold: { DEFAULT: 'rgb(var(--gold) / <alpha-value>)', soft: 'rgb(var(--gold-soft) / <alpha-value>)' },
        good: { DEFAULT: 'rgb(var(--good) / <alpha-value>)', soft: 'rgb(var(--good-soft) / <alpha-value>)' },
        bad: { DEFAULT: 'rgb(var(--bad) / <alpha-value>)', soft: 'rgb(var(--bad-soft) / <alpha-value>)' },
      },
      fontFamily: { sans: ['var(--font-inter)', 'system-ui', 'sans-serif'] },
      borderRadius: { xl2: '1.25rem' },
      boxShadow: { card: '0 1px 2px rgba(20,24,31,.04), 0 8px 24px rgba(20,24,31,.06)' },
    },
  },
  plugins: [],
};
export default config;
