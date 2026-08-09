import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#ffffff',
      black: '#000000',
      bg:      '#0f0f11',
      bg2:     '#17171b',
      bg3:     '#1f1f25',
      bg4:     '#252530',
      border:  '#2e2e38',
      border2: '#3e3e4e',
      text:    '#e8e8f0',
      muted:   '#9696aa',
      muted2:  '#6f6f82',
      accent:  '#6c63ff',
      green:   '#2ecc8a',
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
