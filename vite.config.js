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
      // Aggressive tree-shaking
      treeShaking: true,
    },

    rollupOptions: {
      output: {
        // Split heavy libraries into separate lazy-loaded chunks
        manualChunks(id) {
          // React core — always needed, load first
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
            return "react";
          }
          // Firebase SDK — loaded on auth, split by sub-package
          if (id.includes("node_modules/@firebase/firestore") || id.includes("node_modules/firebase/firestore")) {
            return "firebase-firestore";
          }
          if (id.includes("node_modules/@firebase/storage") || id.includes("node_modules/firebase/storage")) {
            return "firebase-storage";
          }
          if (id.includes("node_modules/@firebase/auth") || id.includes("node_modules/firebase/auth")) {
            return "firebase-auth";
          }
          if (id.includes("node_modules/@firebase/") || id.includes("node_modules/firebase/")) {
            return "firebase-core";
          }
          // Excel/Word export libraries — only loaded when user exports, keep separate
          if (id.includes("node_modules/exceljs")) {
            return "exceljs";
          }
          if (id.includes("node_modules/xlsx")) {
            return "xlsx";
          }
          if (id.includes("node_modules/docx")) {
            return "docx";
          }
        },
        entryFileNames: "assets/[hash].js",
        chunkFileNames: "assets/[hash].js",
        assetFileNames: "assets/[hash][extname]",
      },
    },

    target: "es2020",
    cssCodeSplit: true,
    // Inline small assets (icons, tiny images) directly into CSS/JS
    assetsInlineLimit: 8192,
    // Raise the warning threshold since we know firebase is large
    chunkSizeWarningLimit: 600,
  },
});
