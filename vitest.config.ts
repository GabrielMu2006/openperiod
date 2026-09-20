import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // 允许单测导入带 server-only 守卫的服务端模块
      "server-only": fileURLToPath(new URL("./src/server/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "components/**/*.test.tsx"],
    environmentOptions: {
      jsdom: { url: "http://localhost/" },
    },
  },
});
