// Breed codes as printed on Irish cattle passports (cards). A trailing X marks a cross,
// e.g. AA is pure Aberdeen Angus and AAX is an Aberdeen Angus cross.

export const BREEDS = {
  AA: 'Aberdeen Angus',
  AU: 'Aubrac',
  AY: 'Ayrshire',
  BA: "Blonde d'Aquitaine",
  BB: 'Belgian Blue',
  BS: 'Brown Swiss',
  CH: 'Charolais',
  DX: 'Dexter',
  FR: 'Friesian',
  GA: 'Galloway',
  HE: 'Hereford',
  HI: 'Highland',
  HO: 'Holstein',
  JE: 'Jersey',
  KE: 'Kerry',
  LM: 'Limousin',
  MO: 'Montbéliarde',
  MY: 'Meuse Rhine Yssel',
  NR: 'Norwegian Red',
  PI: 'Piemontese',
  PT: 'Parthenaise',
  RB: 'Rotbunt',
  SA: 'Salers',
  SH: 'Shorthorn',
  SI: 'Simmental',
  SP: 'Speckle Park',
  ST: 'Stabiliser',
  WA: 'Wagyu',
};

const BY_NAME = new Map(Object.entries(BREEDS).map(([code, name]) => [name.toLowerCase(), code]));
BY_NAME.set('holstein friesian', 'HO');

// Tidies what was typed into a card code: "aax" -> "AAX", "Aberdeen Angus" -> "AA",
// "Charolais cross" -> "CHX". Codes not in the list are kept as typed, in capitals.
export function toBreedCode(input) {
  const text = (input ?? '').trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  if (BY_NAME.has(lower)) return BY_NAME.get(lower);
  const crossOf = lower.match(/^(.*?)\s*(?:cross|x)$/)?.[1];
  if (crossOf && BY_NAME.has(crossOf)) return `${BY_NAME.get(crossOf)}X`;
  return text.toUpperCase().replace(/\s+/g, '');
}

// Full name for a code, or '' if the code is not in the list: "AAX" -> "Aberdeen Angus cross".
export function breedName(code) {
  if (BREEDS[code]) return BREEDS[code];
  const base = code?.endsWith('X') ? BREEDS[code.slice(0, -1)] : null;
  return base ? `${base} cross` : '';
}

// Most common on this farm, in the order they should be offered.
const POPULAR = ['AA', 'CH', 'LM', 'HE', 'SH', 'SA', 'FR', 'BB'];

// Every code and its cross, for the form's suggestion list: popular crosses first,
// then their purebreds, then everything else alphabetically.
export function breedOptions() {
  const rest = Object.keys(BREEDS).filter((code) => !POPULAR.includes(code));
  return [...POPULAR.map((code) => `${code}X`), ...POPULAR, ...rest.flatMap((code) => [code, `${code}X`])];
}
