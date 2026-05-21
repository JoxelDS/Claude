import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
  ],
  base: "/Claude/",
  build: {
    sourcemap: false,
    minify: "esbuild",
    esbuildOptions: {
      drop: ["console", "debugger"],
    },

    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
        },
        entryFileNames: "assets/[hash].js",
        chunkFileNames: "assets/[hash].js",
        assetFileNames: "assets/[hash][extname]",
      },
    },

    target: "es2020",
    cssCodeSplit: true,
    assetsInlineLimit: 8192,
  },
});
