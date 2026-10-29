import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            DEV_LOGIN: "true",
            BETTER_AUTH_URL: "http://localhost",
            BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-123",
            GOOGLE_CLIENT_ID: "google-test-id",
            GOOGLE_CLIENT_SECRET: "google-test-secret",
            FACEBOOK_CLIENT_ID: "facebook-test-id",
            FACEBOOK_CLIENT_SECRET: "facebook-test-secret",
          },
        },
      }),
    ],
    test: {
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/setup.ts"],
    },
  };
});
