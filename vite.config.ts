import { defineConfig } from "vite";
import { offlinePwa } from "./tools/offlinePwa";

export default defineConfig({
  base: "./",
  plugins: [offlinePwa()],
  server: { port: 5240, host: true },
});
