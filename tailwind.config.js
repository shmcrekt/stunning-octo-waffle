// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  // CRITICAL: Tells Tailwind where to find the React files to scan for classes
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Enables class-based dark mode switching
  theme: {
    extend: {
      fontFamily: {
        // Ensure Inter is available for custom usage
        inter: ['Inter', 'sans-serif'], 
      },
    },
  },
  plugins: [],
}
