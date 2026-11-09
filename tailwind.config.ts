import type { Config } from "tailwindcss";

// Paleta pensada pro contexto real de uso: motorista lendo a tela em pé
// dentro do carro, muitas vezes sob luz de sol forte -> alto contraste,
// cor de ação bem distinta de estado neutro/erro.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        graphite: {
          950: "#12151C",
          900: "#1B1F29",
          800: "#262C39",
          700: "#374057",
          600: "#4C5771",
        },
        mist: {
          50: "#F6F7F9",
          100: "#ECEEF2",
          200: "#DADFE6",
        },
        amber: {
          500: "#E58A2A",
          600: "#C96F14",
        },
        teal: {
          500: "#1F9D8A",
          600: "#15806F",
        },
        danger: {
          500: "#D64545",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        body: ["'Inter'", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "14px",
      },
    },
  },
  plugins: [],
} satisfies Config;
