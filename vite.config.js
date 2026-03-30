import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import obfuscator from "rollup-plugin-obfuscator";

export default defineConfig({
  plugins: [
    react(),
  ],
  base: "/Claude/",
  build: {
    // ── SECURITY: Never emit source maps in production ──────────────
    // Source maps allow DevTools to show the original readable source.
    // With this off, minified/obfuscated code is all anyone can see.
    sourcemap: false,

    // Use terser for minification (more aggressive than esbuild default)
    minify: "terser",
    terserOptions: {
      compress: {
        // Remove all console.* calls from production build
        drop_console: true,
        // Remove debugger statements
        drop_debugger: true,
        // Inline small functions
        inline: 2,
        // Collapse variable declarations
        collapse_vars: true,
        // Remove dead code
        dead_code: true,
        // Mangle property names in compress pass
        passes: 3,
      },
      mangle: {
        // Shorten all variable/function names to single chars
        toplevel: true,
        // Mangle property names (aggressive)
        properties: false, // keep false — breaks React prop names
      },
      format: {
        // Strip all comments from output
        comments: false,
        // Compact single-line output
        beautify: false,
        // Remove ASCII-only constraint so strings compress better
        ascii_only: false,
      },
    },

    rollupOptions: {
      plugins: [
        // Obfuscate the final bundle — renames variables/functions to gibberish,
        // encodes strings, and injects dead-code traps.
        obfuscator({
          // Rename all identifiers to _0xABCD style hex names
          identifierNamesGenerator: "hexadecimal",
          // Encode string literals so they aren't readable in the file
          stringArray: true,
          stringArrayEncoding: ["base64"],
          stringArrayThreshold: 0.85,
          // Rotate the string array to make static analysis harder
          rotateStringArray: true,
          shuffleStringArray: true,
          // Insert dead code to confuse deobfuscators
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.2,
          // Wrap code in a self-defending function that breaks if formatted
          selfDefending: true,
          // Disable the debugger statement trap (too aggressive)
          debugProtection: false,
          // Flatten control flow to make logic hard to follow
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.5,
          // Obfuscate number literals
          numbersToExpressions: true,
          // Split strings into concatenated parts
          splitStrings: true,
          splitStringsChunkLength: 8,
          // Keep false — renames React globals and breaks the app
          renameGlobals: false,
          // Compact output (no whitespace)
          compact: true,
          log: false,
        }),
      ],
      output: {
        // Split React into its own cached chunk
        manualChunks: {
          react: ["react", "react-dom"],
        },
        // Randomize chunk file names (harder to map back to source)
        entryFileNames: "assets/[hash].js",
        chunkFileNames: "assets/[hash].js",
        assetFileNames: "assets/[hash][extname]",
      },
    },

    // Target modern browsers only (smaller, more obfuscated output)
    target: "es2020",
    // CSS code splitting
    cssCodeSplit: true,
    // Inline small assets
    assetsInlineLimit: 8192,
  },
});
