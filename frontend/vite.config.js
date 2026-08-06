import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // lets the frontend call /api/... during dev without CORS headaches
      "/api": "http://localhost:4000",
    },
  },
});
