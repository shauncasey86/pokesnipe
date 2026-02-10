import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string(),
  ACCESS_PASSWORD: z.string().min(8),
  SESSION_SECRET: z.string().min(32),
  SCRYDEX_API_KEY: z.string(),
  SCRYDEX_TEAM_ID: z.string(),
  EBAY_CLIENT_ID: z.string(),
  EBAY_CLIENT_SECRET: z.string(),
  EXCHANGE_RATE_API_KEY: z.string(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
});

export type AppConfig = z.infer<typeof envSchema>;

export const config: AppConfig = envSchema.parse(process.env);
