/**
 * Bangladesh administrative geography used by the chat parser to
 * locate divisions, districts, thanas/upazilas, and major Dhaka neighborhoods
 * inside free-form Bangla/Banglish text.
 *
 * Strings are stored Banglish-lowercased so we can match against user
 * input by simple lowercase contains-check or fuzzy match.
 */

export type BdDivision = {
  name: string;
  bn: string;
  districts: BdDistrict[];
};

export type BdDistrict = {
  name: string;
  bn: string;
  aliases?: string[];
  thanas?: string[];
};

export const BD_DIVISIONS: BdDivision[] = [
  {
    name: 'Dhaka',
    bn: 'ঢাকা',
    districts: [
      {
        name: 'Dhaka',
        bn: 'ঢাকা',
        thanas: [
          'Adabar', 'Badda', 'Bangsal', 'Cantonment', 'Chowkbazar', 'Darus Salam',
          'Demra', 'Dhanmondi', 'Gendaria', 'Gulshan', 'Hatirjheel', 'Jatrabari',
          'Kafrul', 'Kalabagan', 'Kamrangirchar', 'Khilgaon', 'Khilkhet', 'Kotwali',
          'Lalbagh', 'Mirpur', 'Mohammadpur', 'Motijheel', 'Mugda', 'New Market',
          'Pallabi', 'Paltan', 'Panthapath', 'Ramna', 'Rampura', 'Sabujbagh',
          'Shah Ali', 'Shahbagh', 'Shyampur', 'Sutrapur', 'Tejgaon', 'Turag',
          'Uttara', 'Uttar Khan', 'Dakshin Khan', 'Vatara', 'Wari',
        ],
      },
      { name: 'Faridpur', bn: 'ফরিদপুর' },
      { name: 'Gazipur', bn: 'গাজীপুর', thanas: ['Tongi', 'Kaliakair', 'Kapasia', 'Sreepur', 'Kaliganj'] },
      { name: 'Gopalganj', bn: 'গোপালগঞ্জ' },
      { name: 'Kishoreganj', bn: 'কিশোরগঞ্জ' },
      { name: 'Madaripur', bn: 'মাদারীপুর' },
      { name: 'Manikganj', bn: 'মানিকগঞ্জ' },
      { name: 'Munshiganj', bn: 'মুন্সিগঞ্জ' },
      { name: 'Narayanganj', bn: 'নারায়ণগঞ্জ', thanas: ['Bandar', 'Rupganj', 'Sonargaon', 'Araihazar', 'Fatullah', 'Siddhirganj'] },
      { name: 'Narsingdi', bn: 'নরসিংদী' },
      { name: 'Rajbari', bn: 'রাজবাড়ী' },
      { name: 'Shariatpur', bn: 'শরীয়তপুর' },
      { name: 'Tangail', bn: 'টাঙ্গাইল' },
    ],
  },
  {
    name: 'Chattogram',
    bn: 'চট্টগ্রাম',
    districts: [
      { name: 'Bandarban', bn: 'বান্দরবান' },
      { name: 'Brahmanbaria', bn: 'ব্রাহ্মণবাড়িয়া' },
      { name: 'Chandpur', bn: 'চাঁদপুর' },
      { name: 'Chattogram', bn: 'চট্টগ্রাম', aliases: ['Chittagong', 'Ctg'], thanas: ['Agrabad', 'Akbar Shah', 'Anwara', 'Bakalia', 'Banshkhali', 'Bayazid', 'Boalkhali', 'Chandgaon', 'Chawkbazar', 'Double Mooring', 'Fatikchhari', 'Halishahar', 'Hathazari', 'Karnaphuli', 'Khulshi', 'Kotwali', 'Lohagara', 'Mirsharai', 'Pahartali', 'Panchlaish', 'Patenga', 'Patiya', 'Rangunia', 'Raozan', 'Sandwip', 'Satkania', 'Sitakunda'] },
      { name: 'Cox\'s Bazar', bn: 'কক্সবাজার', aliases: ['Cox Bazar', 'Coxs Bazar'] },
      { name: 'Cumilla', bn: 'কুমিল্লা', aliases: ['Comilla'] },
      { name: 'Feni', bn: 'ফেনী' },
      { name: 'Khagrachhari', bn: 'খাগড়াছড়ি' },
      { name: 'Lakshmipur', bn: 'লক্ষ্মীপুর' },
      { name: 'Noakhali', bn: 'নোয়াখালী' },
      { name: 'Rangamati', bn: 'রাঙ্গামাটি' },
    ],
  },
  {
    name: 'Khulna',
    bn: 'খুলনা',
    districts: [
      { name: 'Bagerhat', bn: 'বাগেরহাট' },
      { name: 'Chuadanga', bn: 'চুয়াডাঙ্গা' },
      { name: 'Jashore', bn: 'যশোর', aliases: ['Jessore'] },
      { name: 'Jhenaidah', bn: 'ঝিনাইদহ' },
      { name: 'Khulna', bn: 'খুলনা' },
      { name: 'Kushtia', bn: 'কুষ্টিয়া' },
      { name: 'Magura', bn: 'মাগুরা' },
      { name: 'Meherpur', bn: 'মেহেরপুর' },
      { name: 'Narail', bn: 'নড়াইল' },
      { name: 'Satkhira', bn: 'সাতক্ষীরা' },
    ],
  },
  {
    name: 'Rajshahi',
    bn: 'রাজশাহী',
    districts: [
      { name: 'Bogura', bn: 'বগুড়া', aliases: ['Bogra'] },
      { name: 'Joypurhat', bn: 'জয়পুরহাট' },
      { name: 'Naogaon', bn: 'নওগাঁ' },
      { name: 'Natore', bn: 'নাটোর' },
      { name: 'Chapainawabganj', bn: 'চাঁপাইনবাবগঞ্জ' },
      { name: 'Pabna', bn: 'পাবনা' },
      { name: 'Rajshahi', bn: 'রাজশাহী' },
      { name: 'Sirajganj', bn: 'সিরাজগঞ্জ' },
    ],
  },
  {
    name: 'Barishal',
    bn: 'বরিশাল',
    districts: [
      { name: 'Barguna', bn: 'বরগুনা' },
      { name: 'Barishal', bn: 'বরিশাল', aliases: ['Barisal'] },
      { name: 'Bhola', bn: 'ভোলা' },
      { name: 'Jhalokati', bn: 'ঝালকাঠি' },
      { name: 'Patuakhali', bn: 'পটুয়াখালী' },
      { name: 'Pirojpur', bn: 'পিরোজপুর' },
    ],
  },
  {
    name: 'Sylhet',
    bn: 'সিলেট',
    districts: [
      { name: 'Habiganj', bn: 'হবিগঞ্জ' },
      { name: 'Moulvibazar', bn: 'মৌলভীবাজার' },
      { name: 'Sunamganj', bn: 'সুনামগঞ্জ' },
      { name: 'Sylhet', bn: 'সিলেট' },
    ],
  },
  {
    name: 'Rangpur',
    bn: 'রংপুর',
    districts: [
      { name: 'Dinajpur', bn: 'দিনাজপুর' },
      { name: 'Gaibandha', bn: 'গাইবান্ধা' },
      { name: 'Kurigram', bn: 'কুড়িগ্রাম' },
      { name: 'Lalmonirhat', bn: 'লালমনিরহাট' },
      { name: 'Nilphamari', bn: 'নীলফামারী' },
      { name: 'Panchagarh', bn: 'পঞ্চগড়' },
      { name: 'Rangpur', bn: 'রংপুর' },
      { name: 'Thakurgaon', bn: 'ঠাকুরগাঁও' },
    ],
  },
  {
    name: 'Mymensingh',
    bn: 'ময়মনসিংহ',
    districts: [
      { name: 'Jamalpur', bn: 'জামালপুর' },
      { name: 'Mymensingh', bn: 'ময়মনসিংহ' },
      { name: 'Netrokona', bn: 'নেত্রকোনা' },
      { name: 'Sherpur', bn: 'শেরপুর' },
    ],
  },
];

/**
 * Common Dhaka neighborhood / area names that show up inside addresses but
 * aren't full thana names. Used as a secondary pass to boost confidence.
 */
export const DHAKA_NEIGHBORHOODS: string[] = [
  'Aftab Nagar', 'Agargaon', 'Azimpur', 'Bashabo', 'Bashundhara', 'Banani',
  'Banasree', 'Banglamotor', 'Baridhara', 'Basabo', 'Bijoy Sarani', 'Dhanmondi',
  'Eskaton', 'Farmgate', 'Gendaria', 'Gulistan', 'Gulshan 1', 'Gulshan 2',
  'Hazaribagh', 'Jigatola', 'Kakrail', 'Kalabagan', 'Kalyanpur', 'Kamalapur',
  'Kawran Bazar', 'Khilgaon', 'Lalmatia', 'Magh Bazar', 'Malibagh', 'Maniknagar',
  'Mirpur 1', 'Mirpur 2', 'Mirpur 6', 'Mirpur 10', 'Mirpur 11', 'Mirpur 12',
  'Mirpur 13', 'Mirpur 14', 'Mirpur DOHS', 'Mohakhali', 'Mohammadpur',
  'Motijheel', 'Moghbazar', 'Mugda', 'Nakhalpara', 'New Market', 'Niketon',
  'Nilkhet', 'Old Dhaka', 'Pallabi', 'Paltan', 'Panthapath', 'Purana Paltan',
  'Rampura', 'Rayer Bazar', 'Sayedabad', 'Shahbag', 'Shankhari Bazar',
  'Shantinagar', 'Shyamoli', 'Tejgaon', 'Tongi', 'Uttara Sector 1',
  'Uttara Sector 3', 'Uttara Sector 4', 'Uttara Sector 7', 'Uttara Sector 10',
  'Uttara Sector 11', 'Uttara Sector 12', 'Uttara Sector 13', 'Uttara Sector 14',
  'Wari', 'Zigatola',
];

/**
 * Flat lookup table built once at module load: a normalized (lowercased,
 * whitespace-collapsed) key → {kind, canonical} entry.
 */
type LookupEntry = {
  kind: 'division' | 'district' | 'thana' | 'neighborhood';
  canonical: string;
  divisionName?: string;
  districtName?: string;
};

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-zà-ÿঀ-৿0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const LOOKUP: Map<string, LookupEntry> = (() => {
  const m = new Map<string, LookupEntry>();
  const add = (key: string, entry: LookupEntry) => {
    const k = normalizeKey(key);
    if (k && !m.has(k)) m.set(k, entry);
  };
  for (const div of BD_DIVISIONS) {
    add(div.name, { kind: 'division', canonical: div.name });
    add(div.bn, { kind: 'division', canonical: div.name });
    for (const dist of div.districts) {
      const distEntry: LookupEntry = {
        kind: 'district',
        canonical: dist.name,
        divisionName: div.name,
      };
      add(dist.name, distEntry);
      add(dist.bn, distEntry);
      for (const alias of dist.aliases ?? []) add(alias, distEntry);
      for (const thana of dist.thanas ?? []) {
        add(thana, {
          kind: 'thana',
          canonical: thana,
          districtName: dist.name,
          divisionName: div.name,
        });
      }
    }
  }
  for (const n of DHAKA_NEIGHBORHOODS) {
    add(n, {
      kind: 'neighborhood',
      canonical: n,
      districtName: 'Dhaka',
      divisionName: 'Dhaka',
    });
  }
  return m;
})();

export type LocationHit = LookupEntry & { matched: string };

/**
 * Scans free text and returns every BD location reference found.
 * The list preserves the order of first appearance.
 */
export function findLocations(text: string): LocationHit[] {
  if (!text) return [];
  const normalized = normalizeKey(text);
  const hits: LocationHit[] = [];
  const seen = new Set<string>();
  for (const [key, entry] of LOOKUP) {
    if (normalized.includes(key)) {
      const sig = `${entry.kind}:${entry.canonical}`;
      if (!seen.has(sig)) {
        seen.add(sig);
        hits.push({ ...entry, matched: key });
      }
    }
  }
  return hits;
}

/**
 * Best-effort city / zone / area triplet from a free-form address.
 * Returns `null` for any slot we cannot infer.
 */
export function inferAddressParts(text: string): {
  city: string | null;
  zone: string | null;
  area: string | null;
} {
  const hits = findLocations(text);
  let city: string | null = null;
  let zone: string | null = null;
  let area: string | null = null;
  for (const h of hits) {
    if (h.kind === 'district' && !city) city = h.canonical;
    else if (h.kind === 'thana' && !zone) {
      zone = h.canonical;
      if (!city && h.districtName) city = h.districtName;
    } else if (h.kind === 'neighborhood' && !area) {
      area = h.canonical;
      if (!city && h.districtName) city = h.districtName;
    }
  }
  return { city, zone, area };
}
