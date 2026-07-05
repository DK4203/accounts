/* currency.js — formatting & conversion helpers.
   Rates are stored as "units of this currency per 1 base unit" is NOT used;
   instead rate = value of 1 unit of this currency expressed in the user's base (default) currency's terms:
   we store rate = how many of this currency equal 1 default-currency unit (like a bank board rate).
   To convert an amount FROM currency A TO currency B: amount / rateA * rateB. */

const CurrencyUtil = {
  list: [], // currencies for current user
  defaultCode: 'USD',

  setAll(currencies) {
    this.list = currencies;
    const def = currencies.find((c) => c.isDefault);
    this.defaultCode = def ? def.code : (currencies[0] ? currencies[0].code : 'USD');
  },

  get(code) {
    return this.list.find((c) => c.code === code) || { code, symbol: code, rate: 1 };
  },

  symbol(code) {
    return this.get(code).symbol || code;
  },

  format(amount, code) {
    const c = this.get(code);
    const n = Number(amount || 0);
    const abs = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${n < 0 ? '-' : ''}${c.symbol}${abs}`;
  },

  // Convert amount from one currency to another using stored rates (rate = units per 1 default currency unit)
  convert(amount, fromCode, toCode) {
    if (fromCode === toCode) return Number(amount);
    const from = this.get(fromCode);
    const to = this.get(toCode);
    const fromRate = Number(from.rate) || 1;
    const toRate = Number(to.rate) || 1;
    const inDefault = Number(amount) / fromRate;
    return inDefault * toRate;
  },

  toDefault(amount, fromCode) {
    return this.convert(amount, fromCode, this.defaultCode);
  },
};
