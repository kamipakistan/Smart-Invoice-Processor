/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#001524',
          800: '#00263E',
          700: '#003756',
        },
        brand: {
          blue: '#458ECC',
          yellow: '#E9D61D',
          cyan: '#00F0FF',
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      }
    },
  },
  plugins: [],
}
