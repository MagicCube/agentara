import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({ routesDirectory: "./src/app" }),
    react(),
    tailwindcss(),
  ],
  server: {
    port: 8000,
    proxy: {
      "/api": {
        target: "http://localhost:1984/api",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      agentara: path.resolve(__dirname, "../src/index.ts"),
    },
  },
  optimizeDeps: {
    exclude: ["js-big-decimal"],
  },
});
