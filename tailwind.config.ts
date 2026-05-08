import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // Light mode surface
        surface: '#FAFAF9',
        // Tray accent (blue family)
        tray: {
          DEFAULT: '#4F8EF7',
          light: '#EBF2FE',
        },
        // Worker accent (orange family)
        worker: {
          DEFAULT: '#F7A14F',
          light: '#FEF3E8',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
