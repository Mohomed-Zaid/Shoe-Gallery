import type { ProductVariant } from '../types';
import { getColourShortName } from './colour';

const textCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const COLOUR_ORDER = [
  'BLACK',
  'WHITE',
  'BROWN',
  'BEIGE',
  'TAN',
  'GREY',
  'ASH',
  'BLUE',
  'NAVY',
  'GREEN',
  'RED',
  'MAROON',
  'PINK',
  'PURPLE',
  'YELLOW',
  'ORANGE',
  'OTHER',
] as const;

const COLOUR_ALIASES: Record<string, (typeof COLOUR_ORDER)[number]> = {
  BLK: 'BLACK',
  WHT: 'WHITE',
  BRN: 'BROWN',
  BEI: 'BEIGE',
  BGE: 'BEIGE',
  TAN: 'TAN',
  GRY: 'GREY',
  ASH: 'ASH',
  BLU: 'BLUE',
  NVY: 'NAVY',
  GRN: 'GREEN',
  RED: 'RED',
  MRN: 'MAROON',
  PNK: 'PINK',
  PUR: 'PURPLE',
  YEL: 'YELLOW',
  ORG: 'ORANGE',
  OTH: 'OTHER',
};

const colourRanks = new Map<string, number>(COLOUR_ORDER.map((colour, index) => [colour, index]));
const sizeRanks = new Map(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].map((size, index) => [size, index]));

function normaliseColour(colour: string) {
  const storedValue = colour.trim().toLocaleUpperCase();
  const shortName = getColourShortName(colour);
  const knownColour = COLOUR_ALIASES[shortName] ?? COLOUR_ALIASES[storedValue];

  return {
    key: knownColour ?? storedValue,
    rank: knownColour === undefined ? COLOUR_ORDER.length : colourRanks.get(knownColour)!,
  };
}

function compareColours(left: string, right: string) {
  const leftColour = normaliseColour(left);
  const rightColour = normaliseColour(right);

  return leftColour.rank - rightColour.rank
    || textCollator.compare(leftColour.key, rightColour.key);
}

function compareSizes(left: string, right: string) {
  const leftValue = left.trim();
  const rightValue = right.trim();
  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);
  const leftIsNumber = leftValue !== '' && Number.isFinite(leftNumber);
  const rightIsNumber = rightValue !== '' && Number.isFinite(rightNumber);

  if (leftIsNumber && rightIsNumber) return leftNumber - rightNumber;
  if (leftIsNumber !== rightIsNumber) return leftIsNumber ? -1 : 1;

  const leftRank = sizeRanks.get(leftValue.toLocaleUpperCase());
  const rightRank = sizeRanks.get(rightValue.toLocaleUpperCase());
  if (leftRank !== undefined && rightRank !== undefined) return leftRank - rightRank;
  if (leftRank !== undefined || rightRank !== undefined) return leftRank !== undefined ? -1 : 1;

  return textCollator.compare(leftValue, rightValue);
}

/** Display-only ordering: colour group first, then natural size order. */
export function compareProductVariants(left: ProductVariant, right: ProductVariant) {
  return compareColours(left.color, right.color)
    || compareSizes(left.size, right.size)
    || textCollator.compare(left.barcode_number ?? '', right.barcode_number ?? '')
    || textCollator.compare(left.id, right.id);
}
