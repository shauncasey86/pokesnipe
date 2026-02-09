import axios from "axios";
import { config } from "../config.js";

export const sendTelegramMessage = async (message: string) => {
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) {
    throw new Error("Telegram credentials not configured");
  }
  const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await axios.post(url, {
    chat_id: config.TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: "Markdown"
  });
};
