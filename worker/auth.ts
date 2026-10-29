import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import type { AppConfig, SocialProvider } from "../shared/types";
import { schema } from "./db/schema";
import { deletePrefix } from "./routes/images";

type SocialConfig = { clientId: string; clientSecret: string };

function socialProviders(env: Env) {
  const providers: Partial<Record<SocialProvider, SocialConfig>> = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }
  if (env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET) {
    providers.facebook = { clientId: env.FACEBOOK_CLIENT_ID, clientSecret: env.FACEBOOK_CLIENT_SECRET };
  }
  return providers;
}

export function appConfig(env: Env): AppConfig {
  return {
    providers: Object.keys(socialProviders(env)) as SocialProvider[],
    devLogin: env.DEV_LOGIN === "true",
    operator: { name: env.OPERATOR_NAME, email: env.CONTACT_EMAIL },
  };
}

export function createAuth(env: Env) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    basePath: "/api/auth",
    database: drizzleAdapter(drizzle(env.DB, { schema }), { provider: "sqlite", schema }),
    socialProviders: socialProviders(env),
    emailAndPassword: { enabled: env.DEV_LOGIN === "true" },
    account: {
      // Only Google is trusted to auto-link by email: it verifies addresses. Facebook doesn't assert that, so a
      // Facebook login with someone else's (unverified) address must not take over their account.
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    user: {
      deleteUser: {
        enabled: true,
        // Rows go with the user via foreign keys; photos live in R2 and need deleting explicitly.
        beforeDelete: async (user) => deletePrefix(env.IMAGES, `${user.id}/`),
      },
    },
    session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
    // Better Auth only turns this on when NODE_ENV is "production", which Workers never set; dev login (local dev
    // and tests) is the one setup that runs without it. Counters live in D1 because isolates don't share memory.
    rateLimit: { enabled: env.DEV_LOGIN !== "true", storage: "database" },
    // Behind Cloudflare the client's address is in cf-connecting-ip; x-forwarded-for can be set by the client.
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;

const instances = new WeakMap<Env, Auth>();

/** One Better Auth instance per environment (isolate), not one per request. */
export function getAuth(env: Env): Auth {
  let auth = instances.get(env);
  if (!auth) {
    auth = createAuth(env);
    instances.set(env, auth);
  }
  return auth;
}
