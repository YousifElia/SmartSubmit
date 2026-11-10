/**
 * Countries and Canadian / US regions.
 *
 * Used twice: to populate the profile's dropdowns, and to match a stored value
 * against whatever wording a form uses ("US", "USA", "United States of
 * America"; "ON", "Ontario").
 */

export interface Country {
  /** ISO 3166-1 alpha-2. */
  code: string;
  /** ISO 3166-1 alpha-3. */
  code3: string;
  /** International calling code, without the plus. */
  dial: string;
  name: string;
  /** Other wordings seen on forms. */
  aliases: string[];
}

// code|code3|dial|name|alias;alias
const COUNTRY_TABLE = `
AF|AFG|93|Afghanistan
AL|ALB|355|Albania
DZ|DZA|213|Algeria
AD|AND|376|Andorra
AO|AGO|244|Angola
AG|ATG|1|Antigua and Barbuda
AR|ARG|54|Argentina
AM|ARM|374|Armenia
AU|AUS|61|Australia
AT|AUT|43|Austria
AZ|AZE|994|Azerbaijan
BS|BHS|1|Bahamas
BH|BHR|973|Bahrain
BD|BGD|880|Bangladesh
BB|BRB|1|Barbados
BY|BLR|375|Belarus
BE|BEL|32|Belgium
BZ|BLZ|501|Belize
BJ|BEN|229|Benin
BT|BTN|975|Bhutan
BO|BOL|591|Bolivia|Bolivia, Plurinational State of
BA|BIH|387|Bosnia and Herzegovina
BW|BWA|267|Botswana
BR|BRA|55|Brazil
BN|BRN|673|Brunei|Brunei Darussalam
BG|BGR|359|Bulgaria
BF|BFA|226|Burkina Faso
BI|BDI|257|Burundi
KH|KHM|855|Cambodia
CM|CMR|237|Cameroon
CA|CAN|1|Canada
CV|CPV|238|Cape Verde|Cabo Verde
CF|CAF|236|Central African Republic
TD|TCD|235|Chad
CL|CHL|56|Chile
CN|CHN|86|China|People's Republic of China
CO|COL|57|Colombia
KM|COM|269|Comoros
CG|COG|242|Congo|Republic of the Congo;Congo (Brazzaville)
CD|COD|243|Democratic Republic of the Congo|Congo, Democratic Republic of the;DRC;Congo (Kinshasa)
CR|CRI|506|Costa Rica
CI|CIV|225|Côte d'Ivoire|Cote d'Ivoire;Ivory Coast
HR|HRV|385|Croatia
CU|CUB|53|Cuba
CY|CYP|357|Cyprus
CZ|CZE|420|Czech Republic|Czechia
DK|DNK|45|Denmark
DJ|DJI|253|Djibouti
DM|DMA|1|Dominica
DO|DOM|1|Dominican Republic
EC|ECU|593|Ecuador
EG|EGY|20|Egypt
SV|SLV|503|El Salvador
GQ|GNQ|240|Equatorial Guinea
ER|ERI|291|Eritrea
EE|EST|372|Estonia
SZ|SWZ|268|Eswatini|Swaziland
ET|ETH|251|Ethiopia
FJ|FJI|679|Fiji
FI|FIN|358|Finland
FR|FRA|33|France
GA|GAB|241|Gabon
GM|GMB|220|Gambia
GE|GEO|995|Georgia
DE|DEU|49|Germany
GH|GHA|233|Ghana
GR|GRC|30|Greece
GD|GRD|1|Grenada
GT|GTM|502|Guatemala
GN|GIN|224|Guinea
GW|GNB|245|Guinea-Bissau
GY|GUY|592|Guyana
HT|HTI|509|Haiti
HN|HND|504|Honduras
HK|HKG|852|Hong Kong|Hong Kong SAR;Hong Kong SAR China
HU|HUN|36|Hungary
IS|ISL|354|Iceland
IN|IND|91|India
ID|IDN|62|Indonesia
IR|IRN|98|Iran|Iran, Islamic Republic of
IQ|IRQ|964|Iraq
IE|IRL|353|Ireland
IL|ISR|972|Israel
IT|ITA|39|Italy
JM|JAM|1|Jamaica
JP|JPN|81|Japan
JO|JOR|962|Jordan
KZ|KAZ|7|Kazakhstan
KE|KEN|254|Kenya
KI|KIR|686|Kiribati
KW|KWT|965|Kuwait
KG|KGZ|996|Kyrgyzstan
LA|LAO|856|Laos|Lao People's Democratic Republic
LV|LVA|371|Latvia
LB|LBN|961|Lebanon
LS|LSO|266|Lesotho
LR|LBR|231|Liberia
LY|LBY|218|Libya
LI|LIE|423|Liechtenstein
LT|LTU|370|Lithuania
LU|LUX|352|Luxembourg
MO|MAC|853|Macau|Macao
MG|MDG|261|Madagascar
MW|MWI|265|Malawi
MY|MYS|60|Malaysia
MV|MDV|960|Maldives
ML|MLI|223|Mali
MT|MLT|356|Malta
MH|MHL|692|Marshall Islands
MR|MRT|222|Mauritania
MU|MUS|230|Mauritius
MX|MEX|52|Mexico
FM|FSM|691|Micronesia
MD|MDA|373|Moldova|Moldova, Republic of
MC|MCO|377|Monaco
MN|MNG|976|Mongolia
ME|MNE|382|Montenegro
MA|MAR|212|Morocco
MZ|MOZ|258|Mozambique
MM|MMR|95|Myanmar|Burma
NA|NAM|264|Namibia
NR|NRU|674|Nauru
NP|NPL|977|Nepal
NL|NLD|31|Netherlands|The Netherlands;Holland
NZ|NZL|64|New Zealand
NI|NIC|505|Nicaragua
NE|NER|227|Niger
NG|NGA|234|Nigeria
KP|PRK|850|North Korea|Korea, Democratic People's Republic of
MK|MKD|389|North Macedonia|Macedonia
NO|NOR|47|Norway
OM|OMN|968|Oman
PK|PAK|92|Pakistan
PW|PLW|680|Palau
PS|PSE|970|Palestine|Palestine, State of;Palestinian Territories
PA|PAN|507|Panama
PG|PNG|675|Papua New Guinea
PY|PRY|595|Paraguay
PE|PER|51|Peru
PH|PHL|63|Philippines
PL|POL|48|Poland
PT|PRT|351|Portugal
PR|PRI|1|Puerto Rico
QA|QAT|974|Qatar
RO|ROU|40|Romania
RU|RUS|7|Russia|Russian Federation
RW|RWA|250|Rwanda
KN|KNA|1|Saint Kitts and Nevis
LC|LCA|1|Saint Lucia
VC|VCT|1|Saint Vincent and the Grenadines
WS|WSM|685|Samoa
SM|SMR|378|San Marino
ST|STP|239|São Tomé and Príncipe|Sao Tome and Principe
SA|SAU|966|Saudi Arabia
SN|SEN|221|Senegal
RS|SRB|381|Serbia
SC|SYC|248|Seychelles
SL|SLE|232|Sierra Leone
SG|SGP|65|Singapore
SK|SVK|421|Slovakia
SI|SVN|386|Slovenia
SB|SLB|677|Solomon Islands
SO|SOM|252|Somalia
ZA|ZAF|27|South Africa
KR|KOR|82|South Korea|Korea, Republic of;Republic of Korea;Korea (South);Korea
SS|SSD|211|South Sudan
ES|ESP|34|Spain
LK|LKA|94|Sri Lanka
SD|SDN|249|Sudan
SR|SUR|597|Suriname
SE|SWE|46|Sweden
CH|CHE|41|Switzerland
SY|SYR|963|Syria|Syrian Arab Republic
TW|TWN|886|Taiwan|Taiwan, Province of China
TJ|TJK|992|Tajikistan
TZ|TZA|255|Tanzania|Tanzania, United Republic of
TH|THA|66|Thailand
TL|TLS|670|Timor-Leste|East Timor
TG|TGO|228|Togo
TO|TON|676|Tonga
TT|TTO|1|Trinidad and Tobago
TN|TUN|216|Tunisia
TR|TUR|90|Turkey|Türkiye;Turkiye
TM|TKM|993|Turkmenistan
TV|TUV|688|Tuvalu
UG|UGA|256|Uganda
UA|UKR|380|Ukraine
AE|ARE|971|United Arab Emirates|UAE
GB|GBR|44|United Kingdom|UK;U.K.;Great Britain;Britain;United Kingdom of Great Britain and Northern Ireland
US|USA|1|United States|United States of America;USA;U.S.;U.S.A.;America;United States (USA)
UY|URY|598|Uruguay
UZ|UZB|998|Uzbekistan
VU|VUT|678|Vanuatu
VA|VAT|39|Vatican City|Holy See
VE|VEN|58|Venezuela|Venezuela, Bolivarian Republic of
VN|VNM|84|Vietnam|Viet Nam
YE|YEM|967|Yemen
ZM|ZMB|260|Zambia
ZW|ZWE|263|Zimbabwe
`;

export const COUNTRIES: Country[] = COUNTRY_TABLE.trim()
  .split('\n')
  .map((line) => {
    const [code = '', code3 = '', dial = '', name = '', aliases = ''] = line.split('|');
    return { code, code3, dial, name, aliases: aliases ? aliases.split(';') : [] };
  });

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function countryByCode(code: string): Country | undefined {
  return BY_CODE.get(code.toUpperCase());
}

export function countryName(code: string): string {
  return countryByCode(code)?.name ?? code;
}

export interface Region {
  country: 'CA' | 'US';
  code: string;
  name: string;
  aliases: string[];
}

const CA_REGIONS: [string, string, ...string[]][] = [
  ['AB', 'Alberta'],
  ['BC', 'British Columbia'],
  ['MB', 'Manitoba'],
  ['NB', 'New Brunswick'],
  ['NL', 'Newfoundland and Labrador', 'Newfoundland'],
  ['NS', 'Nova Scotia'],
  ['NT', 'Northwest Territories'],
  ['NU', 'Nunavut'],
  ['ON', 'Ontario'],
  ['PE', 'Prince Edward Island', 'PEI'],
  ['QC', 'Quebec', 'Québec'],
  ['SK', 'Saskatchewan'],
  ['YT', 'Yukon', 'Yukon Territory'],
];

const US_REGIONS: [string, string, ...string[]][] = [
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['DC', 'District of Columbia', 'Washington DC', 'Washington, D.C.', 'D.C.'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii'],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi'],
  ['MO', 'Missouri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'],
  ['NY', 'New York'],
  ['NC', 'North Carolina'],
  ['ND', 'North Dakota'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington', 'Washington State'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
];

export const REGIONS: Region[] = [
  ...CA_REGIONS.map(([code, name, ...aliases]) => ({ country: 'CA' as const, code, name, aliases })),
  ...US_REGIONS.map(([code, name, ...aliases]) => ({ country: 'US' as const, code, name, aliases })),
];

export function regionsOf(country: string): Region[] {
  return REGIONS.filter((r) => r.country === country);
}

/** Find a region by full name, alias or abbreviation, preferring `country`. */
export function findRegion(value: string, country?: string): Region | undefined {
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  const pool = country ? [...regionsOf(country), ...REGIONS.filter((r) => r.country !== country)] : REGIONS;
  return (
    pool.find((r) => r.name.toLowerCase() === v || r.aliases.some((a) => a.toLowerCase() === v)) ??
    pool.find((r) => r.code.toLowerCase() === v)
  );
}

/** Every wording a form might use for a country, most canonical first. */
export function countryForms(code: string): string[] {
  const c = countryByCode(code);
  if (!c) return code ? [code] : [];
  return [c.name, ...c.aliases, c.code, c.code3];
}

/** Every wording a form might use for a region. */
export function regionForms(value: string, country?: string): string[] {
  const r = findRegion(value, country);
  if (!r) return value ? [value] : [];
  return [r.name, ...r.aliases, r.code];
}
