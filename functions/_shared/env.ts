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
  // WhatsApp Business Cloud API (Meta Graph API). All three optional: unset means the
  // WhatsApp confirmation feature is not provisioned yet and silently no-ops (whatsapp.ts).
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_TEMPLATE_NAME?: string;
}
