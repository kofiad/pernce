/** Every active ISO 4217 national currency (no metals, funds or crypto). The
 * first block is the app's long-standing set plus ZAR, which the pickers pin
 * on top (FEATURED_CURRENCIES); the rest follow by code. */
/** `symbol` is only stored in the server's `currencies` table; the apps
 * format with their own symbol map (mobile/src/lib/money.ts). */
export const CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "GH₵" },
  { code: "XOF", name: "West African CFA Franc", symbol: "CFA" },
  { code: "XAF", name: "Central African CFA Franc", symbol: "FCFA" },
  { code: "CAD", name: "Canadian Dollar", symbol: "CA$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "AED", name: "UAE Dirham", symbol: "AED" },
  { code: "AFN", name: "Afghan Afghani", symbol: "؋" },
  { code: "ALL", name: "Albanian Lek", symbol: "L" },
  { code: "AMD", name: "Armenian Dram", symbol: "֏" },
  { code: "AOA", name: "Angolan Kwanza", symbol: "Kz" },
  { code: "ARS", name: "Argentine Peso", symbol: "AR$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "AWG", name: "Aruban Florin", symbol: "ƒ" },
  { code: "AZN", name: "Azerbaijani Manat", symbol: "₼" },
  { code: "BAM", name: "Bosnia-Herzegovina Convertible Mark", symbol: "KM" },
  { code: "BBD", name: "Barbadian Dollar", symbol: "Bds$" },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳" },
  { code: "BHD", name: "Bahraini Dinar", symbol: "BD" },
  { code: "BIF", name: "Burundian Franc", symbol: "FBu" },
  { code: "BMD", name: "Bermudian Dollar", symbol: "BD$" },
  { code: "BND", name: "Brunei Dollar", symbol: "B$" },
  { code: "BOB", name: "Bolivian Boliviano", symbol: "Bs." },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "BSD", name: "Bahamian Dollar", symbol: "B$" },
  { code: "BTN", name: "Bhutanese Ngultrum", symbol: "Nu." },
  { code: "BWP", name: "Botswana Pula", symbol: "P" },
  { code: "BYN", name: "Belarusian Ruble", symbol: "Br" },
  { code: "BZD", name: "Belize Dollar", symbol: "BZ$" },
  { code: "CDF", name: "Congolese Franc", symbol: "FC" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "CLP", name: "Chilean Peso", symbol: "CL$" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "COP", name: "Colombian Peso", symbol: "CO$" },
  { code: "CRC", name: "Costa Rican Colón", symbol: "₡" },
  { code: "CUP", name: "Cuban Peso", symbol: "₱" },
  { code: "CVE", name: "Cape Verdean Escudo", symbol: "$" },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč" },
  { code: "DJF", name: "Djiboutian Franc", symbol: "Fdj" },
  { code: "DKK", name: "Danish Krone", symbol: "kr" },
  { code: "DOP", name: "Dominican Peso", symbol: "RD$" },
  { code: "DZD", name: "Algerian Dinar", symbol: "DA" },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£" },
  { code: "ERN", name: "Eritrean Nakfa", symbol: "Nfk" },
  { code: "ETB", name: "Ethiopian Birr", symbol: "Br" },
  { code: "FJD", name: "Fijian Dollar", symbol: "FJ$" },
  { code: "FKP", name: "Falkland Islands Pound", symbol: "FK£" },
  { code: "GEL", name: "Georgian Lari", symbol: "₾" },
  { code: "GIP", name: "Gibraltar Pound", symbol: "£" },
  { code: "GMD", name: "Gambian Dalasi", symbol: "D" },
  { code: "GNF", name: "Guinean Franc", symbol: "FG" },
  { code: "GTQ", name: "Guatemalan Quetzal", symbol: "Q" },
  { code: "GYD", name: "Guyanaese Dollar", symbol: "G$" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "HNL", name: "Honduran Lempira", symbol: "L" },
  { code: "HTG", name: "Haitian Gourde", symbol: "G" },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft" },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp" },
  { code: "ILS", name: "Israeli New Shekel", symbol: "₪" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "IQD", name: "Iraqi Dinar", symbol: "ع.د" },
  { code: "IRR", name: "Iranian Rial", symbol: "﷼" },
  { code: "ISK", name: "Icelandic Króna", symbol: "kr" },
  { code: "JMD", name: "Jamaican Dollar", symbol: "J$" },
  { code: "JOD", name: "Jordanian Dinar", symbol: "JD" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh" },
  { code: "KGS", name: "Kyrgystani Som", symbol: "сом" },
  { code: "KHR", name: "Cambodian Riel", symbol: "៛" },
  { code: "KMF", name: "Comorian Franc", symbol: "CF" },
  { code: "KPW", name: "North Korean Won", symbol: "₩" },
  { code: "KRW", name: "South Korean Won", symbol: "₩" },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "KD" },
  { code: "KYD", name: "Cayman Islands Dollar", symbol: "CI$" },
  { code: "KZT", name: "Kazakhstani Tenge", symbol: "₸" },
  { code: "LAK", name: "Laotian Kip", symbol: "₭" },
  { code: "LBP", name: "Lebanese Pound", symbol: "L£" },
  { code: "LKR", name: "Sri Lankan Rupee", symbol: "Rs" },
  { code: "LRD", name: "Liberian Dollar", symbol: "L$" },
  { code: "LSL", name: "Lesotho Loti", symbol: "L" },
  { code: "LYD", name: "Libyan Dinar", symbol: "LD" },
  { code: "MAD", name: "Moroccan Dirham", symbol: "MAD" },
  { code: "MDL", name: "Moldovan Leu", symbol: "L" },
  { code: "MGA", name: "Malagasy Ariary", symbol: "Ar" },
  { code: "MKD", name: "Macedonian Denar", symbol: "ден" },
  { code: "MMK", name: "Myanmar Kyat", symbol: "K" },
  { code: "MNT", name: "Mongolian Tugrik", symbol: "₮" },
  { code: "MOP", name: "Macanese Pataca", symbol: "MOP$" },
  { code: "MRU", name: "Mauritanian Ouguiya", symbol: "UM" },
  { code: "MUR", name: "Mauritian Rupee", symbol: "Rs" },
  { code: "MVR", name: "Maldivian Rufiyaa", symbol: "Rf" },
  { code: "MWK", name: "Malawian Kwacha", symbol: "MK" },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
  { code: "MZN", name: "Mozambican Metical", symbol: "MT" },
  { code: "NAD", name: "Namibian Dollar", symbol: "N$" },
  { code: "NIO", name: "Nicaraguan Córdoba", symbol: "C$" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
  { code: "NPR", name: "Nepalese Rupee", symbol: "Rs" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "OMR", name: "Omani Rial", symbol: "OMR" },
  { code: "PAB", name: "Panamanian Balboa", symbol: "B/." },
  { code: "PEN", name: "Peruvian Sol", symbol: "S/" },
  { code: "PGK", name: "Papua New Guinean Kina", symbol: "K" },
  { code: "PHP", name: "Philippine Peso", symbol: "₱" },
  { code: "PKR", name: "Pakistani Rupee", symbol: "Rs" },
  { code: "PLN", name: "Polish Złoty", symbol: "zł" },
  { code: "PYG", name: "Paraguayan Guarani", symbol: "₲" },
  { code: "QAR", name: "Qatari Riyal", symbol: "QR" },
  { code: "RON", name: "Romanian Leu", symbol: "lei" },
  { code: "RSD", name: "Serbian Dinar", symbol: "din" },
  { code: "RUB", name: "Russian Ruble", symbol: "₽" },
  { code: "RWF", name: "Rwandan Franc", symbol: "FRw" },
  { code: "SAR", name: "Saudi Riyal", symbol: "SR" },
  { code: "SBD", name: "Solomon Islands Dollar", symbol: "SI$" },
  { code: "SCR", name: "Seychellois Rupee", symbol: "SR" },
  { code: "SDG", name: "Sudanese Pound", symbol: "SDG" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "SHP", name: "Saint Helena Pound", symbol: "£" },
  { code: "SLE", name: "Sierra Leonean Leone", symbol: "Le" },
  { code: "SOS", name: "Somali Shilling", symbol: "Sh" },
  { code: "SRD", name: "Surinamese Dollar", symbol: "Sr$" },
  { code: "SSP", name: "South Sudanese Pound", symbol: "SSP" },
  { code: "STN", name: "São Tomé & Príncipe Dobra", symbol: "Db" },
  { code: "SYP", name: "Syrian Pound", symbol: "£S" },
  { code: "SZL", name: "Swazi Lilangeni", symbol: "E" },
  { code: "THB", name: "Thai Baht", symbol: "฿" },
  { code: "TJS", name: "Tajikistani Somoni", symbol: "SM" },
  { code: "TMT", name: "Turkmenistani Manat", symbol: "m" },
  { code: "TND", name: "Tunisian Dinar", symbol: "DT" },
  { code: "TOP", name: "Tongan Paʻanga", symbol: "T$" },
  { code: "TRY", name: "Turkish Lira", symbol: "₺" },
  { code: "TTD", name: "Trinidad & Tobago Dollar", symbol: "TT$" },
  { code: "TWD", name: "New Taiwan Dollar", symbol: "NT$" },
  { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh" },
  { code: "UAH", name: "Ukrainian Hryvnia", symbol: "₴" },
  { code: "UGX", name: "Ugandan Shilling", symbol: "USh" },
  { code: "UYU", name: "Uruguayan Peso", symbol: "$U" },
  { code: "UZS", name: "Uzbekistani Som", symbol: "soʻm" },
  { code: "VES", name: "Venezuelan Bolívar", symbol: "Bs.S" },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫" },
  { code: "VUV", name: "Vanuatu Vatu", symbol: "VT" },
  { code: "WST", name: "Samoan Tala", symbol: "WS$" },
  { code: "XCD", name: "East Caribbean Dollar", symbol: "EC$" },
  { code: "XCG", name: "Caribbean Guilder", symbol: "ƒ" },
  { code: "XPF", name: "CFP Franc", symbol: "₣" },
  { code: "YER", name: "Yemeni Rial", symbol: "﷼" },
  { code: "ZMW", name: "Zambian Kwacha", symbol: "ZK" },
  { code: "ZWG", name: "Zimbabwe Gold", symbol: "ZiG" },
] as const;

/** Codes that left ISO 4217 and so are no longer in CURRENCIES (with the
 * year and what replaced them). The core test fails if one comes back, and
 * is where to record the next retirement. */
export const RETIRED_CURRENCIES = {
  BGN: "euro, 2026",
  ANG: "XCG, 2025",
} as const;

/** Currencies whose market rate is known to be unreliable (official vs.
 * street rates, hyperinflation, sanctions), so the app says a rate may be
 * inaccurate however fresh it is. */
export const VOLATILE_CURRENCIES: readonly string[] = ["VES", "SYP", "IRR", "KPW", "ZWG", "LBP", "SSP", "CUP"];

/** Pinned at the top of the currency picker. */
export const FEATURED_CURRENCIES = CURRENCIES.slice(0, 9).map((c) => c.code);

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const ACCOUNT_TYPES = [
  { value: "bank", label: "Bank" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "investment", label: "Investment" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
] as const;

/** Swatches shown in the account color picker. Each entry must resolve to a
 * `--color-{token}` custom property in globals.css (see tokenColor). To add
 * more, define the CSS var there (in both the :root and @theme inline
 * blocks), add it to tokens.ts for the mobile app, and append the token
 * name here — the picker UI wraps automatically. */
export const ACCOUNT_COLORS = [
  "primary",
  "accent-light-blue",
  "accent-pink",
  "accent-teal",
  "accent-yellow",
  "accent-warning",
  "accent-light-green",
  "accent-brown",
  "accent-violet",
  "accent-magenta",
  "accent-lime",
  "accent-slate",
  "accent-cyan",
  "accent-coral",
  "accent-plum",
  "accent-steel",
] as const;

/** Convert a native-currency amount into the base currency using a
 * { currency -> rateToUsd } map, with USD as the pivot.
 *
 * A currency with no rate in the map falls back to treating it as 1:1 with
 * USD, rather than throwing - one missing rate shouldn't take down every
 * total on the page. That fallback produces a plausible-looking but wrong
 * number, though, so it's logged loudly: a currency reaching here with no
 * rate means either a new currency was added to CURRENCIES without seeding
 * exchange_rates for it, or the FX cron hasn't run yet since a deploy. */
export function toBaseCurrency(
  amount: number,
  fromCurrency: string,
  baseCurrency: string,
  ratesToUsd: Record<string, number>,
) {
  if (fromCurrency === baseCurrency) return amount;
  if (!(fromCurrency in ratesToUsd)) {
    console.warn(
      `[toBaseCurrency] No exchange rate for "${fromCurrency}" - treating it as 1:1 with USD. Totals involving this currency will be wrong until a rate is added.`,
    );
  }
  if (!(baseCurrency in ratesToUsd)) {
    console.warn(
      `[toBaseCurrency] No exchange rate for base currency "${baseCurrency}" - treating it as 1:1 with USD. Totals will be wrong until a rate is added.`,
    );
  }
  const fromRate = ratesToUsd[fromCurrency] ?? 1;
  const baseRate = ratesToUsd[baseCurrency] ?? 1;
  const usdAmount = amount * fromRate;
  return usdAmount / baseRate;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
