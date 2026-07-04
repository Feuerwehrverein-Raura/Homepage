/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Einkauf gehört zum Lager (Inventarsystem) -> gleiche Farbe wie Inventar-Blau.
        // Werte = Tailwind-Standard-Blau, damit cart-* exakt wie blue-* im Lager rendert.
        cart: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
          400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
          800: '#1e40af', 900: '#1e3a8a'
        }
      }
    },
  },
  plugins: [],
}
