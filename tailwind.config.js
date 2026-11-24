
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#080c14',
        surface: '#101725',
        panel: '#131e2e',
        accent: '#38bdf8',
        cyan: '#22d3ee',
        success: '#34d399',
        danger: '#fb7185',
        muted: '#8291a8',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'sans-serif'],
        mono: ['Cascadia Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 25px rgba(56,189,248,0.12)',
      },
    },
  },
  plugins: [],
}
