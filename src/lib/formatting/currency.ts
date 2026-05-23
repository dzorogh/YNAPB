const DEFAULT_LOCALE = "ru-RU";

export const formatAmount = (value: number): string =>
  new Intl.NumberFormat(DEFAULT_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
