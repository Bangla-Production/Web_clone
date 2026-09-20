/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Space Grotesk"', '"Plus Jakarta Sans"', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        pos: {
          dark: 'var(--color-pos-dark)',
          surface: 'var(--color-pos-surface)',
          card: 'var(--color-pos-card)',
          cardHover: 'var(--color-pos-card-hover)',
          border: 'var(--color-pos-border)',
          accent: '#10b981',
          highlight: '#38bdf8',
          hot: '#f59e0b',
          amber: '#f59e0b',
          yellow: '#fbbf24',
          purple: '#a855f7',
          rose: '#f43f5e',
        }
      },
      boxShadow: {
        'pos-glow': '0 0 25px -4px rgba(16, 185, 129, 0.35)',
        'pos-amber': '0 0 25px -4px rgba(245, 158, 11, 0.45)',
        'pos-sky': '0 0 25px -4px rgba(56, 189, 248, 0.4)',
        'pos-purple': '0 0 25px -4px rgba(168, 85, 247, 0.45)',
        'pos-card': 'var(--color-pos-shadow)',
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'badge-ping': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'glow-bounce': 'bounce 2s infinite',
      }
    },
  },
  plugins: [],
}
