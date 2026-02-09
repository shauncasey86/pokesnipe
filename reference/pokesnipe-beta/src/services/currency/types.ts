// src/services/currency/types.ts

export interface ExchangeRates {
  base: 'GBP';
  rates: {
    USD: number;
    EUR: number;
    JPY: number;
  };
  lastUpdated: Date;
  source: string;
}

export interface ConversionResult {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  targetCurrency: string;
  rate: number;
  rateTimestamp: Date;
}