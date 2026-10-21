/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  corePlugins: {
    // Preserve existing base styles so existing forms, views and buttons are never broken
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669', // Signature athletic emerald
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
          volt: '#a3e635',
          purple: '#7045c6', // Backwards compatibility
        },
        court: {
          surface: '#0f291e',
          'surface-subtle': '#14382a',
          border: '#1f4e3b',
          line: '#e2f5ec',
          volt: '#a3e635',
          emerald: '#10b981',
        },
        podium: {
          gold: '#f59e0b',
          'gold-light': '#fef3c7',
          'gold-dark': '#b45309',
          silver: '#94a3b8',
          'silver-light': '#f1f5f9',
          'silver-dark': '#475569',
          bronze: '#d97706',
          'bronze-light': '#ffedd5',
          'bronze-dark': '#9a3412',
        },
        darkbg: {
          canvas: '#0b0f19',
          surface: '#111827',
          'surface-subtle': '#182234',
          'surface-elevated': '#1f2d42',
          border: '#243247',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-emerald': '0 0 25px rgba(16, 185, 129, 0.35)',
        'glow-volt': '0 0 25px rgba(163, 230, 53, 0.35)',
        'glow-purple': '0 0 25px rgba(112, 69, 198, 0.35)',
        'glow-gold': '0 0 25px rgba(245, 158, 11, 0.35)',
        'glow-silver': '0 0 20px rgba(148, 163, 184, 0.25)',
        'glow-bronze': '0 0 20px rgba(217, 119, 6, 0.25)',
      },
    },
  },
  plugins: [],
};
