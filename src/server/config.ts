import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  ACCESS_PASSWORD: z.string().min(8, "ACCESS_PASSWORD must be at least 8 characters"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  SCRYDEX_API_KEY: z.string().min(1),
  SCRYDEX_TEAM_ID: z.string().min(1),
  EBAY_CLIENT_ID: z.string().min(1),
  EBAY_CLIENT_SECRET: z.string().min(1),
  EXCHANGE_RATE_API_KEY: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional()
});

export type AppConfig = z.infer<typeof envSchema>;

export const config: AppConfig = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  ACCESS_PASSWORD: process.env.ACCESS_PASSWORD,
  SESSION_SECRET: process.env.SESSION_SECRET,
  SCRYDEX_API_KEY: process.env.SCRYDEX_API_KEY,
  SCRYDEX_TEAM_ID: process.env.SCRYDEX_TEAM_ID,
  EBAY_CLIENT_ID: process.env.EBAY_CLIENT_ID,
  EBAY_CLIENT_SECRET: process.env.EBAY_CLIENT_SECRET,
  EXCHANGE_RATE_API_KEY: process.env.EXCHANGE_RATE_API_KEY,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID
});
