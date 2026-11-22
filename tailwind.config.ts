import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#ffffff',
      black: '#000000',
      bg:      '#0b0b0c',
      bg2:     '#181819',
      bg3:     '#232325',
      bg4:     '#303032',
      border:  '#303033',
      border2: '#4c4c50',
      text:    '#f6f6f7',
      muted:   '#aaaab1',
      muted2:  '#777780',
      accent:  '#a6f5ae',
      signal:  '#e9bb7b',
      green:   '#a6f5ae',
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
