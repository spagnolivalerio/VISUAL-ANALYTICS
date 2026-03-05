import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  server: {
    host: "0.0.0.0",
    port: 5001,
    watch: {
      usePolling: true,
      interval: 200,
    },
    proxy: {
      "/api": {
        target: "http://data-processing-cont:5000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
