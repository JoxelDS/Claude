import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react({
      fastRefresh: process.env.NODE_ENV !== "production",
    }),
  ],
  base: "/Claude/",
  build: {
    sourcemap: false,
    // Terser compresses significantly better than esbuild (10-20% smaller JS)
    minify: "terser",
    terserOptions: {
      compress: {
        passes: 2,           // two-pass for better dead-code elimination
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ["console.log", "console.warn", "console.info"],
        unsafe_arrows: true,
        unsafe_methods: true,
        reduce_vars: true,
        collapse_vars: true,
      },
      mangle: { toplevel: true },
      format: { comments: false },
    },

    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core — tiny, always needed first
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
            return "react";
          }
          // Firebase split by sub-package so only needed modules load
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
          // QR code — only used for QR generation, keep out of main bundle
          if (id.includes("node_modules/qrcode")) {
            return "qrcode";
          }
          // Export libs — only loaded on demand via dynamic import()
          if (id.includes("node_modules/exceljs")) return "exceljs";
          if (id.includes("node_modules/xlsx"))    return "xlsx";
          if (id.includes("node_modules/docx"))    return "docx";
        },
        entryFileNames: "assets/[hash].js",
        chunkFileNames: "assets/[hash].js",
        assetFileNames: "assets/[hash][extname]",
      },
    },

    target: "es2020",
    cssCodeSplit: true,
    assetsInlineLimit: 8192,
    chunkSizeWarningLimit: 700,
  },
});
