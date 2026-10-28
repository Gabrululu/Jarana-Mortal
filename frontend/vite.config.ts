import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { mediaPlugin } from "./server/media-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), mediaPlugin()],
  // stellar-sdk espera `global` como en Node
  define: { global: "globalThis" },
  server: { port: 5173 },
  preview: { port: 5173 },
  build: { chunkSizeWarningLimit: 2500 },
});
