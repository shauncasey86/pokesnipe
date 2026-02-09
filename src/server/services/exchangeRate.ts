import axios from "axios";
import { config } from "../config.js";
import { pool } from "../db/pool.js";

const API_URL = "https://v6.exchangerate-api.com/v6";

export const getUsdToGbpRate = async () => {
  const { rows } = await pool.query(
    "SELECT rate, fetched_at FROM exchange_rates WHERE base_currency='USD' AND quote_currency='GBP' ORDER BY fetched_at DESC LIMIT 1"
  );
  if (rows.length > 0) {
    const { rate, fetched_at } = rows[0];
    const age = Date.now() - new Date(fetched_at).getTime();
    if (age < 1000 * 60 * 60 * 12) {
      return rate as number;
    }
  }

  const { data } = await axios.get(`${API_URL}/${config.EXCHANGE_RATE_API_KEY}/latest/USD`);
  const rate = data.conversion_rates?.GBP;
  if (!rate) throw new Error("Missing GBP rate from exchange API");
  await pool.query(
    "INSERT INTO exchange_rates (base_currency, quote_currency, rate, fetched_at) VALUES ($1,$2,$3,now())",
    ["USD", "GBP", rate]
  );
  return rate as number;
};
