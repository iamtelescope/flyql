import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import { resolve } from "path";

const projectDir = resolve(import.meta.dirname);

function reportPlugin() {
  return {
    name: "serve-report",
    configureServer(server) {
      server.middlewares.use("/api/report", (req, res) => {
        const filePath = process.env.E2E_REPORT_FILE;
        if (!filePath) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "E2E_REPORT_FILE env var not set" }));
          return;
        }
        try {
          const data = fs.readFileSync(filePath, "utf-8");
          res.setHeader("Content-Type", "application/json");
          res.end(data);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: `Failed to read ${filePath}: ${err.message}`,
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), reportPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      vue: resolve(projectDir, "node_modules/vue"),
    },
  },
});
