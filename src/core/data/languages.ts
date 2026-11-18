/**
 * Spoken languages: the names and codes application forms use for them, for
 * matching "French (FRA)" or "Français" to a profile's "French".
 */

const NAMES: [string, ...string[]][] = [
  ['English', 'EN', 'ENG', 'Anglais', 'Inglés'],
  ['French', 'FR', 'FRA', 'FRE', 'Français', 'Francais'],
  ['Spanish', 'ES', 'SPA', 'Español', 'Espanol', 'Castilian'],
  ['Mandarin', 'Mandarin Chinese', 'Chinese (Mandarin)', 'Chinese - Mandarin', 'Putonghua', 'CMN', 'ZH', 'Chinese'],
  ['Cantonese', 'Cantonese Chinese', 'Chinese (Cantonese)', 'Chinese - Cantonese', 'YUE'],
  ['Arabic', 'AR', 'ARA'],
  ['Hindi', 'HI', 'HIN'],
  ['Punjabi', 'Panjabi', 'PA', 'PAN'],
  ['Urdu', 'UR', 'URD'],
  ['Bengali', 'Bangla', 'BN', 'BEN'],
  ['Tamil', 'TA', 'TAM'],
  ['Telugu', 'TE', 'TEL'],
  ['Marathi', 'MR', 'MAR'],
  ['Gujarati', 'GU', 'GUJ'],
  ['Tagalog', 'Filipino', 'TL', 'TGL', 'FIL'],
  ['Vietnamese', 'VI', 'VIE'],
  ['Korean', 'KO', 'KOR'],
  ['Japanese', 'JA', 'JPN'],
  ['Portuguese', 'PT', 'POR', 'Português'],
  ['Italian', 'IT', 'ITA', 'Italiano'],
  ['German', 'DE', 'DEU', 'GER', 'Deutsch'],
  ['Dutch', 'NL', 'NLD', 'DUT', 'Nederlands'],
  ['Russian', 'RU', 'RUS'],
  ['Ukrainian', 'UK', 'UKR'],
  ['Polish', 'PL', 'POL'],
  ['Romanian', 'RO', 'RON', 'RUM'],
  ['Greek', 'EL', 'ELL', 'GRE'],
  ['Turkish', 'TR', 'TUR'],
  ['Persian', 'Farsi', 'FA', 'FAS', 'PER'],
  ['Hebrew', 'HE', 'HEB'],
  ['Somali', 'SO', 'SOM'],
  ['Amharic', 'AM', 'AMH'],
  ['Swahili', 'SW', 'SWA'],
  ['Hausa', 'HA', 'HAU'],
  ['Yoruba', 'YO', 'YOR'],
  ['Igbo', 'IG', 'IBO'],
  ['Thai', 'TH', 'THA'],
  ['Indonesian', 'Bahasa Indonesia', 'ID', 'IND'],
  ['Malay', 'Bahasa Melayu', 'MS', 'MSA'],
  ['Swedish', 'SV', 'SWE'],
  ['Norwegian', 'NO', 'NOR'],
  ['Danish', 'DA', 'DAN'],
  ['Finnish', 'FI', 'FIN'],
  ['Czech', 'CS', 'CES', 'CZE'],
  ['Hungarian', 'HU', 'HUN'],
  ['Serbian', 'SR', 'SRP'],
  ['Croatian', 'HR', 'HRV'],
  ['Armenian', 'HY', 'HYE', 'ARM'],
  ['Nepali', 'NE', 'NEP'],
  ['Sinhala', 'Sinhalese', 'SI', 'SIN'],
  ['Pashto', 'PS', 'PUS'],
  ['Kurdish', 'KU', 'KUR'],
  ['Haitian Creole', 'Kreyòl', 'HT', 'HAT'],
  ['Cree', 'CR', 'CRE'],
  ['Ojibwe', 'Ojibwa', 'OJ', 'OJI'],
  ['Inuktitut', 'IU', 'IKU'],
  ['American Sign Language', 'ASL'],
  ['Langue des signes québécoise', 'LSQ'],
  ['Latin', 'LA', 'LAT'],
];

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** The usual name for a language, given any of its names or codes, or '' if unknown. */
export function languageName(text: string): string {
  const key = fold(text);
  if (!key) return '';
  for (const [name, ...others] of NAMES) {
    if (fold(name) === key) return name;
    // Codes only count in capitals ("FR"), to keep "it" or "no" from matching.
    if (others.some((o) => (o.length <= 3 && /^[A-Z]+$/.test(o) ? o === text.trim() : fold(o) === key))) return name;
  }
  return '';
}

/** Every way a form may write a language, its usual name first. */
export function languageForms(language: string): string[] {
  const name = languageName(language) || language.trim();
  const entry = NAMES.find(([n]) => n === name);
  return entry ? [...entry] : [name];
}

/** Whether two names mean the same language ("Farsi" and "Persian"). */
export function sameLanguage(a: string, b: string): boolean {
  const x = languageName(a) || fold(a);
  const y = languageName(b) || fold(b);
  return x !== '' && x === y;
}

const isCode = (word: string) => word.length <= 3 && /^[A-Z]+$/.test(word);

/** The languages a question or option names: "French (FRA)", "English and French". */
export function languagesIn(text: string): string[] {
  const found: { name: string; at: number }[] = [];
  const folded = ` ${fold(text).replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ')} `;
  for (const [name, ...others] of NAMES) {
    const words = [name, ...others.filter((o) => !isCode(o))];
    const positions = words
      .map((w) => folded.indexOf(` ${fold(w).replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim()} `))
      .filter((at) => at >= 0);
    // Codes count only in brackets, as forms write them: "French (FRA)".
    const coded = others.some((o) => isCode(o) && new RegExp(`\\(\\s*${o}\\s*\\)`).test(text));
    if (positions.length > 0 || coded) found.push({ name, at: positions.length > 0 ? Math.min(...positions) : Infinity });
  }
  let names = found.sort((a, b) => a.at - b.at).map((f) => f.name);
  // "Chinese (Cantonese)" names Cantonese, not Mandarin.
  if (names.includes('Cantonese') && names.includes('Mandarin') && !/mandarin/i.test(text)) names = names.filter((n) => n !== 'Mandarin');
  return names;
}

/** Is this, as an option's text, the name of a spoken language? */
export function isLanguageName(text: string): boolean {
  return languagesIn(text).length > 0 && text.trim().split(/\s+/).length <= 5;
}
