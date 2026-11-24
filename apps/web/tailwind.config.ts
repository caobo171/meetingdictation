import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

// shadcn/ui tokens (HSL channels in globals.css). The older names (paper, ink, brand…) point at the
// same tokens so every screen shares one palette.
const hsl = (v: string) => `hsl(var(--${v}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'media',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        border: hsl('border'),
        input: hsl('input'),
        ring: hsl('ring'),
        background: hsl('background'),
        foreground: hsl('foreground'),
        primary: { DEFAULT: hsl('primary'), foreground: hsl('primary-foreground') },
        secondary: { DEFAULT: hsl('secondary'), foreground: hsl('secondary-foreground') },
        destructive: { DEFAULT: hsl('destructive'), foreground: hsl('destructive-foreground'), soft: hsl('destructive-soft') },
        muted: { DEFAULT: hsl('muted'), foreground: hsl('muted-foreground') },
        accent: { DEFAULT: hsl('accent'), foreground: hsl('accent-foreground') },
        popover: { DEFAULT: hsl('popover'), foreground: hsl('popover-foreground') },
        card: { DEFAULT: hsl('card'), foreground: hsl('card-foreground') },
        success: { DEFAULT: hsl('success'), soft: hsl('success-soft') },
        warning: { DEFAULT: hsl('warning'), soft: hsl('warning-soft') },
        // Older names, same tokens.
        bg: hsl('background'),
        bg2: hsl('muted'),
        paper: hsl('card'),
        line: hsl('border'),
        ink: { DEFAULT: hsl('foreground'), 2: hsl('ink-2'), 3: hsl('muted-foreground') },
        brand: { DEFAULT: hsl('primary'), deep: hsl('primary-deep'), soft: hsl('primary-soft') },
        gold: { DEFAULT: hsl('warning'), soft: hsl('warning-soft') },
        good: { DEFAULT: hsl('success'), soft: hsl('success-soft') },
        bad: { DEFAULT: hsl('destructive'), soft: hsl('destructive-soft') },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)', xl2: 'calc(var(--radius) + 4px)' },
      fontFamily: { sans: ['var(--font-inter)', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px 0 rgb(0 0 0 / 0.04)' },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: { 'accordion-down': 'accordion-down 0.2s ease-out', 'accordion-up': 'accordion-up 0.2s ease-out' },
    },
  },
  plugins: [animate],
};
export default config;
