export interface Env {
  DB: D1Database;
  TURNSTILE_SECRET: string;
  MAILERLITE_API_KEY: string;
  ADMIN_BEARER_SECRET: string;
  IDENTITY_SALT_SEED: string;
  // MailerLite group id used for double opt-in subscriptions.
  ML_GROUP_ID: string;
  // Optional preview origin allowed for CORS and as the Turnstile hostname.
  PREVIEW_ORIGIN?: string;
}
