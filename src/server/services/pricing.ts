export const calcBuyerProtectionFee = (priceGbp: number) => {
  const flat = 0.1;
  const band1 = Math.min(priceGbp, 20) * 0.07;
  const band2 = Math.max(0, Math.min(priceGbp, 300) - 20) * 0.04;
  const band3 = Math.max(0, Math.min(priceGbp, 4000) - 300) * 0.02;
  const total = flat + band1 + band2 + band3;
  return { flat, band1, band2, band3, total };
};

export const calculateProfit = (price: number, shipping: number, marketGbp: number) => {
  const subtotal = price + shipping;
  const bp = calcBuyerProtectionFee(subtotal);
  const totalCost = subtotal + bp.total;
  const profit = marketGbp - totalCost;
  const pct = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  return {
    subtotal,
    buyerProtection: bp,
    totalCost,
    profit,
    profitPct: pct
  };
};
