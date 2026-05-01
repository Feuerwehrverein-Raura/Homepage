/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'fwv-red': '#dc2626',
        'fwv-red-hover': '#b91c1c',
        'fwv-gold': '#fbbf24',
      }
    },
  },
  plugins: [],
}
