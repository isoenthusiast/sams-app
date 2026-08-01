import { defineConfig, env } from "prisma/config";

export default defineConfig({
  datasource: {
    db: {
      url: env("DATABASE_URL"),
    },
  },
});
