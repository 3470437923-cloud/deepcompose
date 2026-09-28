import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Tauri 需要固定端口、不清屏、固定 outDir
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5183,
    strictPort: true,
    watch: {
      // src-tauri 由 cargo 自己管；另外必须忽略原子写入留下的临时目录：
      // 在 S: 这类卷上，编辑器落盘的 `.name.<pid>.<guid>.tmpdir/` 会被
      // 文件监视器当成新目录去 watch，随即以 EBUSY 崩掉整个 dev server。
      ignored: ["**/src-tauri/**", "**/*.tmpdir/**", "**/.*.tmpdir/**"],
    },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    target: "chrome110",
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
