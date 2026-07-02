/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './*.{ts,tsx}',
    './{components,context,hooks,services,utils,config}/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        web3: {
          bg: 'var(--bg-color)',
          card: 'var(--card-bg)',
          cardHover: 'var(--card-hover)',
          border: 'var(--border-color)',
          text: 'var(--text-color)',
          textMuted: 'var(--text-muted)',
          primary: 'var(--primary)',
          secondary: 'var(--secondary)',
          accent: 'var(--accent)',
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
