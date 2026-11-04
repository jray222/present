const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: token('cream'),
        surface: token('surface'),
        sunk: token('sunk'),
        ink: token('ink'),
        muted: token('muted'),
        line: token('line'),
        // Holiday Cranberry & Warm Tomato
        tomato: {
          50: '#fff1ee', 100: '#ffe0d9', 200: '#ffc0b3', 300: '#ff9a86', 400: '#fa7b66',
          500: '#f25c45', 600: '#d9432c', 700: '#b43524', 800: '#8d2b1e', 900: '#5f1d14',
        },
        // Winter Pine & Frosted Leaf
        pine: {
          50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80',
          500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d',
        },
        sunny: {
          50: '#fffbe6', 100: '#fff3b8', 200: '#ffe680', 300: '#ffd95a', 400: '#ffcf3f',
          500: '#ffc21a', 600: '#e8a800', 700: '#b88200',
        },
        frost: {
          50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8',
          500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1',
        },
      },
      fontFamily: {
        display: ['"Nunito Variable"', 'ui-rounded', '"SF Pro Rounded"', 'system-ui', 'sans-serif'],
        sans: ['"Nunito Sans Variable"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgb(120 70 30 / 0.05), 0 4px 14px rgb(120 70 30 / 0.07)',
        lift: '0 2px 4px rgb(120 70 30 / 0.06), 0 12px 28px rgb(120 70 30 / 0.12)',
        pop: '0 6px 20px rgb(217 67 44 / 0.35)',
        pine: '0 6px 20px rgb(21 128 61 / 0.30)',
      },
    },
  },
  plugins: [],
};
