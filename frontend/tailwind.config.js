/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
        cyber: {
          dark: '#0a0d14',
          card: '#121722',
          border: '#1f293d',
          accent: '#10b981',
        }
      }
    },
  },
  plugins: [],
}
