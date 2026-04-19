/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        raptor: {
          orange: '#FF6B00',
          'orange-dark': '#CC5500',
          // CSS-var backed — theme switches automatically
          dark:         'var(--rl-bg-base)',
          base:         'var(--rl-bg-base)',
          card:         'var(--rl-bg-card)',
          elevated:     'var(--rl-bg-elevated)',
          input:        'var(--rl-bg-input)',
          border:       'var(--rl-border)',
          'border-light': 'var(--rl-border-light)',
          primary:      'var(--rl-text-primary)',
          secondary:    'var(--rl-text-secondary)',
          muted:        'var(--rl-text-muted)',
          accent:       'var(--rl-accent)',
          sidebar:      'var(--rl-sidebar-bg)',
        },
        ford: {
          navy:  '#003478',
          deep:  '#002255',
          blue:  '#0562D2',
        }
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Barlow Condensed', 'system-ui', 'sans-serif'],
      }
    }
  },
  plugins: []
}
