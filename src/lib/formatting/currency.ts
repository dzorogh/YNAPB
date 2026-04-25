const DEFAULT_LOCALE = "en-US";
const DEFAULT_CURRENCY_CODE = "USD";

const sanitizeCurrencyCode = (currencyCode: string): string =>
  currencyCode.trim().toUpperCase();

export const formatCurrency = (value: number, currencyCode: string): string => {
  const code = sanitizeCurrencyCode(currencyCode);
  try {
    return new Intl.NumberFormat(DEFAULT_LOCALE, {
      style: "currency",
      currency: code || DEFAULT_CURRENCY_CODE,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return new Intl.NumberFormat(DEFAULT_LOCALE, {
      style: "currency",
      currency: DEFAULT_CURRENCY_CODE,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }
};
