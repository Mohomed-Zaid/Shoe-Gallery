const COLOUR_SHORT_NAMES: Record<string, string> = {
  black: 'BLK',
  white: 'WHT',
  red: 'RED',
  blue: 'BLU',
  green: 'GRN',
  yellow: 'YEL',
  brown: 'BRN',
  grey: 'GRY',
  gray: 'GRY',
  pink: 'PNK',
  purple: 'PUR',
  orange: 'ORG',
  beige: 'BEI',
  navy: 'NVY',
  maroon: 'MRN',
  cream: 'CRM',
  gold: 'GLD',
  silver: 'SLV',
};

export function getColourShortName(colour: string | null | undefined): string {
  const normalized = colour?.trim().toLowerCase() ?? '';
  if (!normalized) return '';

  const knownShortName = COLOUR_SHORT_NAMES[normalized];
  if (knownShortName) return knownShortName;

  const compactName = normalized.replace(/[^a-z0-9]/g, '');
  const abbreviationSource = compactName || normalized.replace(/\s+/g, '');
  return abbreviationSource.slice(0, 3).toLocaleUpperCase();
}
