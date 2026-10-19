/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: 'rgb(var(--wp-surface) / <alpha-value>)',
          muted: 'rgb(var(--wp-surface-muted) / <alpha-value>)',
          raised: 'rgb(var(--wp-surface-raised) / <alpha-value>)',
        },
        content: {
          DEFAULT: 'rgb(var(--wp-content) / <alpha-value>)',
          muted: 'rgb(var(--wp-content-muted) / <alpha-value>)',
        },
        line: 'rgb(var(--wp-line) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--wp-accent) / <alpha-value>)',
          fg: 'rgb(var(--wp-accent-fg) / <alpha-value>)',
        },
        danger: 'rgb(var(--wp-danger) / <alpha-value>)',
        success: 'rgb(var(--wp-success) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
