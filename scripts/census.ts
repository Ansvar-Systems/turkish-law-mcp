#!/usr/bin/env tsx
/**
 * Turkish Law MCP — Census Script
 *
 * Enumerates ALL Turkish laws (Kanunlar) from mevzuat.gov.tr by calling the
 * official DataTable API endpoint (/Anasayfa/MevzuatDatatable).
 *
 * Covers:
 *   - Kanunlar (Laws, MevzuatTur=1): ~912 in-force laws
 *   - Kanun Hükmünde Kararnameler (KHK/Decree Laws, MevzuatTur=4): ~63
 *   - Cumhurbaşkanlığı Kararnameleri (Presidential Decrees, MevzuatTur=19): ~33
 *
 * Writes data/census.json in golden standard format.
 *
 * Usage:
 *   npx tsx scripts/census.ts
 *   npx tsx scripts/census.ts --laws-only    # Only Kanunlar (MevzuatTur=1)
 *
 * Data source: mevzuat.gov.tr (Cumhurbaşkanlığı Mevzuat Bilgi Sistemi)
 * License: Government Public Data
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../data');
const CENSUS_PATH = path.join(DATA_DIR, 'census.json');

const DATATABLE_URL = 'https://www.mevzuat.gov.tr/Anasayfa/MevzuatDatatable';
const PAGE_SIZE = 100;
const DELAY_MS = 500;

/**
 * Legislation type codes on mevzuat.gov.tr
 */
interface LegislationType {
  mevzuatTur: number;
  label: string;
  labelEn: string;
  /** MevzuatTertip — 5 for current legislation period */
  tertip: number;
}

const LEGISLATION_TYPES: LegislationType[] = [
  { mevzuatTur: 1, label: 'Kanunlar', labelEn: 'Laws', tertip: 5 },
  { mevzuatTur: 4, label: 'KHK', labelEn: 'Decree Laws', tertip: 5 },
  { mevzuatTur: 19, label: 'Cumhurbaşkanlığı Kararnameleri', labelEn: 'Presidential Decrees', tertip: 5 },
];

interface DataTableResponse {
  draw: number;
  recordsTotal: number;
  recordsFiltered: number;
  data: DataTableRecord[];
}

interface DataTableRecord {
  mevzuatNo: string;
  mevAdi: string;
  kabulTarih: string | null;
  resmiGazeteTarihi: string | null;
  resmiGazeteSayisi: string | null;
  mevzuatTertip: string;
  nitelik: string | null;
  mevzuatTur: number;
  url: string;
  resmiGazeteTarihiGun: string | null;
  resmiGazeteTarihiAy: string | null;
  resmiGazeteTarihiYil: string | null;
  ilgaEdenKanunTarih: string | null;
  ilgaEdenKanunNo: string | null;
  ilgaEdenKanunMaddesi: string | null;
  digerKanunlar: string | null;
}

interface CensusLaw {
  id: string;
  mevzuatNo: string;
  mevzuatTur: number;
  mevzuatTertip: number;
  title: string;
  type: 'kanun' | 'khk' | 'cumhurbaskanligi_kararnamesi';
  gazetteDate: string;
  gazetteNumber: string;
  acceptanceDate: string;
  url: string;
  classification: 'ingestable' | 'inaccessible' | 'metadata_only';
  repealed: boolean;
  repealedBy: string | null;
}

interface CensusOutput {
  generated_at: string;
  source: string;
  description: string;
  stats: {
    total: number;
    kanunlar: number;
    khk: number;
    presidential_decrees: number;
    class_ingestable: number;
    class_inaccessible: number;
    class_metadata_only: number;
  };
  ingestion?: {
    completed_at: string;
    total_laws: number;
    total_provisions: number;
    coverage_pct: string;
  };
  laws: CensusLaw[];
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert a Turkish date string (DD.MM.YYYY) to ISO format (YYYY-MM-DD).
 */
function turkishDateToIso(dateStr: string | null): string {
  if (!dateStr) return '';
  const parts = dateStr.split('.');
  if (parts.length !== 3) return dateStr;
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Generate a kebab-case ID from mevzuatNo and mevzuatTur.
 */
function generateId(record: DataTableRecord): string {
  const prefix = record.mevzuatTur === 1 ? 'kanun'
    : record.mevzuatTur === 4 ? 'khk'
    : record.mevzuatTur === 19 ? 'cbk'
    : 'law';
  return `${prefix}-${record.mevzuatNo}`;
}

function getLawType(mevzuatTur: number): CensusLaw['type'] {
  switch (mevzuatTur) {
    case 1: return 'kanun';
    case 4: return 'khk';
    case 19: return 'cumhurbaskanligi_kararnamesi';
    default: return 'kanun';
  }
}

/**
 * Fetch a page from the MevzuatDatatable API.
 */
async function fetchDataTablePage(
  mevzuatTur: number,
  start: number,
  length: number,
  draw: number,
): Promise<DataTableResponse> {
  const body = JSON.stringify({
    draw,
    start,
    length,
    parameters: {
      MevzuatTur: String(mevzuatTur),
      MevzuatNo: '',
      AranacakIfade: '',
      AranacakYer: '0',
      BaslangicTarihi: '',
      BitisTarihi: '',
    },
  });

  const response = await fetch(DATATABLE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (compatible; Turkish-Law-MCP/2.0)',
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://www.mevzuat.gov.tr/',
      'Origin': 'https://www.mevzuat.gov.tr',
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from MevzuatDatatable`);
  }

  return response.json() as Promise<DataTableResponse>;
}

/**
 * Enumerate all laws for a given legislation type.
 */
async function enumerateType(legType: LegislationType): Promise<CensusLaw[]> {
  const laws: CensusLaw[] = [];
  let start = 0;
  let draw = 1;
  let totalRecords = 0;

  // First request to get total count
  const firstPage = await fetchDataTablePage(legType.mevzuatTur, 0, PAGE_SIZE, draw);
  totalRecords = firstPage.recordsTotal;
  console.log(`  ${legType.label} (MevzuatTur=${legType.mevzuatTur}): ${totalRecords} records`);

  // Process first page
  for (const record of firstPage.data) {
    const isRepealed = !!(record.ilgaEdenKanunNo || record.ilgaEdenKanunTarih);
    laws.push({
      id: generateId(record),
      mevzuatNo: record.mevzuatNo,
      mevzuatTur: legType.mevzuatTur,
      mevzuatTertip: legType.tertip,
      title: record.mevAdi,
      type: getLawType(legType.mevzuatTur),
      gazetteDate: turkishDateToIso(record.resmiGazeteTarihi),
      gazetteNumber: record.resmiGazeteSayisi ?? '',
      acceptanceDate: turkishDateToIso(record.kabulTarih),
      url: `https://www.mevzuat.gov.tr/${record.url}`,
      classification: 'ingestable',
      repealed: isRepealed,
      repealedBy: record.ilgaEdenKanunNo,
    });
  }

  start += PAGE_SIZE;
  draw++;

  // Fetch remaining pages
  while (start < totalRecords) {
    await delay(DELAY_MS);
    const page = await fetchDataTablePage(legType.mevzuatTur, start, PAGE_SIZE, draw);

    for (const record of page.data) {
      const isRepealed = !!(record.ilgaEdenKanunNo || record.ilgaEdenKanunTarih);
      laws.push({
        id: generateId(record),
        mevzuatNo: record.mevzuatNo,
        mevzuatTur: legType.mevzuatTur,
        mevzuatTertip: legType.tertip,
        title: record.mevAdi,
        type: getLawType(legType.mevzuatTur),
        gazetteDate: turkishDateToIso(record.resmiGazeteTarihi),
        gazetteNumber: record.resmiGazeteSayisi ?? '',
        acceptanceDate: turkishDateToIso(record.kabulTarih),
        url: `https://www.mevzuat.gov.tr/${record.url}`,
        classification: 'ingestable',
        repealed: isRepealed,
        repealedBy: record.ilgaEdenKanunNo,
      });
    }

    process.stdout.write(`    Fetched ${Math.min(start + PAGE_SIZE, totalRecords)}/${totalRecords}\r`);
    start += PAGE_SIZE;
    draw++;
  }

  console.log(`    Fetched ${laws.length} ${legType.labelEn} total`);
  return laws;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const lawsOnly = args.includes('--laws-only');

  console.log('Turkish Law MCP — Census');
  console.log('========================\n');
  console.log('  Source:  mevzuat.gov.tr (Cumhurbaşkanlığı Mevzuat Bilgi Sistemi)');
  console.log('  Method:  MevzuatDatatable API (paginated JSON)');
  console.log('  License: Government Public Data\n');

  const allLaws: CensusLaw[] = [];
  const seen = new Set<string>();

  const types = lawsOnly ? [LEGISLATION_TYPES[0]] : LEGISLATION_TYPES;

  for (const legType of types) {
    try {
      const laws = await enumerateType(legType);
      for (const law of laws) {
        if (!seen.has(law.id)) {
          seen.add(law.id);
          allLaws.push(law);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  ERROR enumerating ${legType.label}: ${msg}`);
    }

    await delay(DELAY_MS);
  }

  // Sort by mevzuatNo (descending, newest first)
  allLaws.sort((a, b) => Number(b.mevzuatNo) - Number(a.mevzuatNo));

  // Build census output
  const kanunCount = allLaws.filter(l => l.type === 'kanun').length;
  const khkCount = allLaws.filter(l => l.type === 'khk').length;
  const cbkCount = allLaws.filter(l => l.type === 'cumhurbaskanligi_kararnamesi').length;

  const census: CensusOutput = {
    generated_at: new Date().toISOString(),
    source: 'mevzuat.gov.tr (Cumhurbaşkanlığı Mevzuat Bilgi Sistemi)',
    description: 'Full census of Turkish legislation — Kanunlar, KHK, Cumhurbaşkanlığı Kararnameleri',
    stats: {
      total: allLaws.length,
      kanunlar: kanunCount,
      khk: khkCount,
      presidential_decrees: cbkCount,
      class_ingestable: allLaws.filter(l => l.classification === 'ingestable').length,
      class_inaccessible: allLaws.filter(l => l.classification === 'inaccessible').length,
      class_metadata_only: allLaws.filter(l => l.classification === 'metadata_only').length,
    },
    laws: allLaws,
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2) + '\n');

  console.log(`\n${'='.repeat(50)}`);
  console.log('CENSUS COMPLETE');
  console.log('='.repeat(50));
  console.log(`  Total laws discovered: ${allLaws.length}`);
  console.log(`  Kanunlar:              ${kanunCount}`);
  console.log(`  KHK:                   ${khkCount}`);
  console.log(`  Presidential Decrees:  ${cbkCount}`);
  console.log(`  Ingestable:            ${census.stats.class_ingestable}`);
  console.log(`  Repealed:              ${allLaws.filter(l => l.repealed).length}`);
  console.log(`\n  Output: ${CENSUS_PATH}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
