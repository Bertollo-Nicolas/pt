import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#ffffff',
      black: '#000000',
      bg:      '#111413',
      bg2:     '#191d1b',
      bg3:     '#222724',
      bg4:     '#2b322e',
      border:  '#303833',
      border2: '#48524b',
      text:    '#eeefe9',
      muted:   '#a1aaa3',
      muted2:  '#7c8980',
      accent:  '#337454',
      green:   '#8bd5ad',
      red:     '#e05555',
      orange:  '#e09540',
      blue:    '#4a9eff',
      yellow:  '#d4c040',
    },
    fontFamily: {
      sans: ['"SF Pro Display"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
    },
    borderRadius: {
      none: '0',
      sm: '4px',
      DEFAULT: '8px',
      lg: '12px',
      xl: '16px',
      '2xl': '24px',
      full: '9999px',
    },
    extend: {
      gridTemplateColumns: {
        '13': 'repeat(13, minmax(0, 1fr))',
      },
    },
  },
  plugins: [],
} satisfies Config;
