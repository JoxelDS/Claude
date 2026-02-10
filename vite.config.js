import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/Claude/",
  build: {
    // Split React into its own chunk — browsers cache it separately
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
        },
      },
    },
    // Target modern browsers only (smaller output)
    target: "es2020",
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Inline small assets to reduce HTTP requests
    assetsInlineLimit: 8192,
  },
});
