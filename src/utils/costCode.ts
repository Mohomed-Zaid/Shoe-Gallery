const COST_CODE_MAP: Readonly<Record<string, string>> = {
  '1': 'B',
  '2': 'E',
  '3': 'S',
  '4': 'T',
  '5': 'K',
  '6': 'I',
  '7': 'N',
  '8': 'D',
  '9': 'O',
  '0': 'M',
};

export function encodeCostPrice(costPrice: number | string): string {
  let integerDigits: string;

  if (typeof costPrice === 'number') {
    if (!Number.isFinite(costPrice) || costPrice < 0) return '';
    integerDigits = Math.trunc(costPrice).toString();
  } else {
    const match = costPrice.trim().match(/-?\d[\d,]*(?:\.\d+)?/);
    if (!match || match[0].startsWith('-')) return '';
    integerDigits = match[0].replaceAll(',', '').split('.')[0];
    integerDigits = integerDigits.replace(/^0+(?=\d)/, '');
  }

  if (!/^\d+$/.test(integerDigits)) return '';
  return [...integerDigits].map((digit) => COST_CODE_MAP[digit]).join('');
}

