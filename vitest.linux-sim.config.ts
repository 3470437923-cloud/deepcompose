import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

// 仅模拟平台分支；实际文件系统、Rust 与 WebKitGTK 仍属于宿主。
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    reporters: ["default"],
    setupFiles: ["./vitest.linux-sim.setup.ts"],
  },
});
