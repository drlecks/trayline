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
        // Source accent (green family) — data coming in from the world
        source: {
          DEFAULT: '#4CB87E',
          light: '#E8F6EE',
          strip: '#3FA86E',
        },
        // Tray accent (blue family)
        tray: {
          DEFAULT: '#4F8EF7',
          light: '#EBF2FE',
          strip: '#3F7CE0',
        },
        // Worker accent (violet family) — distinct from blue trays and from
        // the amber/red/green reserved for live status signalling.
        worker: {
          DEFAULT: '#8B6FE8',
          light: '#F0EBFB',
          strip: '#6E50D8',
        },
        // Error accent (red family)
        error: {
          DEFAULT: '#E5484D',
          light: '#FDECEC',
          strip: '#CC3338',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
