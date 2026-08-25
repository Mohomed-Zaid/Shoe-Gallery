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

const COST_DIGIT_MAP: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(COST_CODE_MAP).map(([digit, letter]) => [letter, digit]),
  ),
);

export function encodeCost(costPrice: number | string): string {
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

export function decodeCostCode(code: string): number | null {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode || !/^[BESTKINDOM]+$/.test(normalizedCode)) return null;

  const numericCost = Number(
    [...normalizedCode].map((letter) => COST_DIGIT_MAP[letter]).join(''),
  );

  return Number.isSafeInteger(numericCost) ? numericCost : null;
}

// Keep the existing barcode API stable while sharing the same mapping.
export const encodeCostPrice = encodeCost;
