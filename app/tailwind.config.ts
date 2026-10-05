import type { Config } from 'tailwindcss';

/**
 * Tokens Young-Link.
 * Direção visual: mockup 2 (índigo + violeta, cards suaves, sidebar branca).
 * Suporte dark mode via class ("dark") controlada pelo utilizador (toggle manual).
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#4f46e5',
          hover: '#4338ca',
          soft: '#eef2ff',
          strong: '#3730a3',
        },
        ink: {
          DEFAULT: '#0a0a0a',
          soft: '#6b7280',
          muted: '#9ca3af',
          invert: '#f3f4f6',
        },
        surface: {
          DEFAULT: '#ffffff',
          alt: '#f4f4f8',
          page: '#f8f9fc',
        },
        line: {
          DEFAULT: '#e5e7eb',
          soft: '#f0f0f3',
        },
        good: { DEFAULT: '#16a34a', soft: '#dcfce7', ink: '#166534' },
        bad:  { DEFAULT: '#e11d48', soft: '#ffe4e6', ink: '#be123c' },
        warn: { DEFAULT: '#f59e0b', soft: '#fef3c7', ink: '#92400e' },
        info: { DEFAULT: '#0ea5e9', soft: '#e0f2fe', ink: '#075985' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(10,10,10,.04)',
        card: '0 4px 12px rgba(10,10,10,.06)',
        lg: '0 10px 30px -8px rgba(10,10,10,.1)',
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '10px',
        lg: '14px',
      },
      fontSize: {
        xs: ['0.72rem', { lineHeight: '1.4' }],
        sm: ['0.82rem', { lineHeight: '1.45' }],
        base: ['0.9rem', { lineHeight: '1.5' }],
        lg: ['1rem', { lineHeight: '1.5' }],
        xl: ['1.2rem', { lineHeight: '1.4' }],
        '2xl': ['1.5rem', { lineHeight: '1.3' }],
      },
    },
  },
  plugins: [],
} satisfies Config;
