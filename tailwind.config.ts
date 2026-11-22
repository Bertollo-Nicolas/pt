import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#ffffff',
      black: '#000000',
      bg:      '#101114',
      bg2:     '#191b21',
      bg3:     '#23262d',
      bg4:     '#2d313b',
      border:  '#30343e',
      border2: '#474d5a',
      text:    '#f2f3f6',
      muted:   '#a2a8b5',
      muted2:  '#747c8c',
      accent:  '#607ff5',
      signal:  '#e9bb7b',
      green:   '#77d6ad',
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
