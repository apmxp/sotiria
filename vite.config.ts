import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "node:path";

export default defineConfig({
plugins: [
  cloudflare({ viteEnvironment: { name: "ssr" } }),
  tanstackStart(),
  react(),
  tailwindcss(),
],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
