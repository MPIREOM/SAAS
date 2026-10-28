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

/**
 * On-screen amount: thousands separators, no trailing zeros, baisa kept
 * when present ("1,400", "12,974.464"). Western digits in both locales.
 * PDFs and exports keep formatCurrency.
 */
export function formatAmount(amount: number | string | null | undefined): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount ?? NaN;
  if (num === null || isNaN(num as number)) return "0";
  return (num as number).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}
