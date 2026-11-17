import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.chagas.transporte",
  appName: "Chagas Transporte",
  webDir: "mobile-shell",
  server: {
    // The current Next.js app depends on server routes and Supabase auth.
    // Keep the first native shell connected to the existing production app.
    url: "https://chagas-transporte.vercel.app",
    cleartext: false,
  },
  android: {
    backgroundColor: "#12151C",
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
