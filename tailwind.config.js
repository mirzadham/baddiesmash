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
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#7045c6', // Signature purple from reference
          700: '#5b21b6',
          800: '#4c1d95',
          900: '#3b0764',
          950: '#1d0b3a',
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
          canvas: '#0f0e17',
          surface: '#181724',
          'surface-subtle': '#222034',
          'surface-elevated': '#2b2942',
          border: '#2e2c44',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-purple': '0 0 25px rgba(112, 69, 198, 0.35)',
        'glow-gold': '0 0 25px rgba(245, 158, 11, 0.35)',
        'glow-silver': '0 0 20px rgba(148, 163, 184, 0.25)',
        'glow-bronze': '0 0 20px rgba(217, 119, 6, 0.25)',
      },
    },
  },
  plugins: [],
};
