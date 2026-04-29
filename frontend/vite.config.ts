import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/auth": "http://127.0.0.1:8000",
      "/users": "http://127.0.0.1:8000",
      "/instances": "http://127.0.0.1:8000",
      "/channels": "http://127.0.0.1:8000",
      "/sync": "http://127.0.0.1:8000",
      "/health": "http://127.0.0.1:8000"
    }
  }
});
