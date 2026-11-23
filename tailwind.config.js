/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'] },
      colors: {
        brand: {
          50: '#eef5ff', 100: '#e3eeff', 200: '#cfe0fb', 300: '#a8c7f8', 400: '#5c9bf8',
          500: '#2f80ff', 600: '#1668f2', 700: '#0b4fd0', 800: '#0a3fa6',
        },
        teal2: { 50: '#e6faf6', 100: '#c7f3ea', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e' },
        ink: { DEFAULT: '#0a1730', 2: '#46556e', 3: '#5b6a84' },
      },
      boxShadow: {
        soft: '0 10px 30px -12px rgba(22,104,242,.25)',
        lift: '0 18px 40px -14px rgba(22,104,242,.38)',
        glow: '0 8px 22px -6px rgba(22,104,242,.55)',
      },
    },
  },
  plugins: [],
};
