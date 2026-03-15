// Default currency for the system (Oman)
export const CURRENCY = {
  code: "OMR",
  symbol: "OMR",
  locale: "en-OM",
};

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0.00";
  return num.toLocaleString(CURRENCY.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCurrencyWithCode(amount: number | string): string {
  return `${formatCurrency(amount)} ${CURRENCY.code}`;
}
