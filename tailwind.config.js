/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        'dashboard-accent': '#10b981',
        'dashboard-accent-light': '#14b8a6',
        'dashboard-text-primary': '#ffffff',
        'dashboard-text-label': 'rgba(255,255,255,0.7)',
        'dashboard-text-sub': 'rgba(255,255,255,0.5)',
        'dashboard-border': 'rgba(255,255,255,0.1)',
        'dashboard-teal': '#14b8a6',
      },
      backgroundColor: {
        'dashboard-bg-deep': '#010d0a',
        'dashboard-hover': 'rgba(255,255,255,0.05)',
        'dashboard-icon-bg': 'rgba(255,255,255,0.1)',
      },
      keyframes: {
        'slide-in': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      animation: {
        'slide-in': 'slide-in 0.3s ease-out',
      },
    },
  },
  plugins: [],
};
