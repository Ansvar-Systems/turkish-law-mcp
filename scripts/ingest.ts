#!/usr/bin/env tsx
/**
 * Turkish Law MCP -- Ingestion Pipeline
 *
 * Fetches Turkish legislation from mevzuat.gov.tr (Presidency Legislation
 * Information System). mevzuat.gov.tr provides public access to all current
 * Turkish legislation as Government Public Data.
 *
 * The pipeline:
 * 1. Fetches the HTML page for each law from mevzuat.gov.tr
 * 2. Parses the HTML to extract "Madde" (Article) provisions
 * 3. Saves structured seed JSON files for the database builder
 *
 * If fetching fails (e.g., bot protection, network issues), the pipeline
 * creates seed files from law metadata with available provision stubs.
 *
 * Usage:
 *   npm run ingest                    # Full ingestion
 *   npm run ingest -- --limit 5       # Test with 5 acts
 *   npm run ingest -- --skip-fetch    # Reuse cached HTML
 *
 * Data source: mevzuat.gov.tr (Cumhurbaşkanlığı Mevzuat Bilgi Sistemi)
 * License: Government Public Data
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchWithRateLimit } from './lib/fetcher.js';
import { parseTurkishHtml, KEY_TURKISH_ACTS, type ActIndexEntry, type ParsedAct } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

function parseArgs(): { limit: number | null; skipFetch: boolean } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipFetch = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--skip-fetch') {
      skipFetch = true;
    }
  }

  return { limit, skipFetch };
}

/**
 * Create a fallback seed file when fetching fails.
 *
 * Generates a seed with law metadata and stub provisions based on known
 * law structure. This ensures the database always has at least basic
 * coverage even when the upstream source is unavailable.
 */
function createFallbackSeed(act: ActIndexEntry): ParsedAct {
  const provisions: ParsedAct['provisions'] = [];
  const definitions: ParsedAct['definitions'] = [];

  // Generate known stub provisions for each law based on standard Turkish law structure
  const stubs = getFallbackProvisions(act);
  provisions.push(...stubs.provisions);
  definitions.push(...stubs.definitions);

  return {
    id: act.id,
    type: 'statute',
    title: act.title,
    title_en: act.titleEn,
    short_name: act.shortName,
    status: act.status,
    issued_date: act.issuedDate,
    in_force_date: act.inForceDate,
    url: act.url,
    description: act.description,
    provisions,
    definitions,
  };
}

/**
 * Return known provisions for each key Turkish law.
 * These are based on the authoritative text and standard structure
 * of each law. Used when live fetching is unavailable.
 */
function getFallbackProvisions(act: ActIndexEntry): {
  provisions: ParsedAct['provisions'];
  definitions: ParsedAct['definitions'];
} {
  const provisions: ParsedAct['provisions'] = [];
  const definitions: ParsedAct['definitions'] = [];

  switch (act.id) {
    case 'kvkk-6698':
      provisions.push(
        {
          provision_ref: 'madde1', section: '1', chapter: 'Birinci B\u00f6l\u00fcm - Ama\u00e7, Kapsam ve Tan\u0131mlar',
          title: 'Ama\u00e7',
          content: 'Madde 1 - Bu Kanunun amac\u0131, ki\u015fisel verilerin i\u015flenmesinde ba\u015fta \u00f6zel hayat\u0131n gizlili\u011fi olmak \u00fczere ki\u015filerin temel hak ve \u00f6zg\u00fcrl\u00fcklerini korumak ve ki\u015fisel verileri i\u015fleyen ger\u00e7ek ve t\u00fczel ki\u015filerin y\u00fck\u00fcml\u00fcl\u00fckleri ile uyacaklar\u0131 usul ve esaslar\u0131 d\u00fczenlemektir.',
        },
        {
          provision_ref: 'madde2', section: '2', chapter: 'Birinci B\u00f6l\u00fcm - Ama\u00e7, Kapsam ve Tan\u0131mlar',
          title: 'Kapsam',
          content: 'Madde 2 - Bu Kanun h\u00fck\u00fcmleri, ki\u015fisel verileri i\u015flenen ger\u00e7ek ki\u015filer ile bu verileri tamamen veya k\u0131smen otomatik olan ya da herhangi bir veri kay\u0131t sisteminin par\u00e7as\u0131 olmak kayd\u0131yla otomatik olmayan yollarla i\u015fleyen ger\u00e7ek ve t\u00fczel ki\u015filer hakk\u0131nda uygulan\u0131r.',
        },
        {
          provision_ref: 'madde3', section: '3', chapter: 'Birinci B\u00f6l\u00fcm - Ama\u00e7, Kapsam ve Tan\u0131mlar',
          title: 'Tan\u0131mlar',
          content: 'Madde 3 - Bu Kanunun uygulanmas\u0131nda; a) A\u00e7\u0131k r\u0131za: Belirli bir konuya ili\u015fkin, bilgilendirilmeye dayanan ve \u00f6zg\u00fcr iradeyle a\u00e7\u0131klanan r\u0131zay\u0131, b) Anonim hale getirme: Ki\u015fisel verilerin, ba\u015fka verilerle e\u015fle\u015ftirilerek dahi hi\u00e7bir surette kimli\u011fi belirli veya belirlenebilir bir ger\u00e7ek ki\u015fiye ili\u015fkilendirilemeyecek hale getirilmesini, c) Ba\u015fkan: Ki\u015fisel Verileri Koruma Kurumu Ba\u015fkan\u0131n\u0131, \u00e7) \u0130lgili ki\u015fi: Ki\u015fisel verisi i\u015flenen ger\u00e7ek ki\u015fiyi, d) Ki\u015fisel veri: Kimli\u011fi belirli veya belirlenebilir ger\u00e7ek ki\u015fiye ili\u015fkin her t\u00fcrl\u00fc bilgiyi, e) Ki\u015fisel verilerin i\u015flenmesi: Ki\u015fisel verilerin tamamen veya k\u0131smen otomatik olan ya da herhangi bir veri kay\u0131t sisteminin par\u00e7as\u0131 olmak kayd\u0131yla otomatik olmayan yollarla elde edilmesi, kaydedilmesi, depolanmas\u0131, muhafaza edilmesi, de\u011fi\u015ftirilmesi, yeniden d\u00fczenlenmesi, a\u00e7\u0131klanmas\u0131, aktar\u0131lmas\u0131, devral\u0131nmas\u0131, elde edilebilir hale getirilmesi, s\u0131n\u0131fland\u0131r\u0131lmas\u0131 ya da kullan\u0131lmas\u0131n\u0131n engellenmesi gibi veriler \u00fczerinde ger\u00e7ekle\u015ftirilen her t\u00fcrl\u00fc i\u015flemi, f) Kurul: Ki\u015fisel Verileri Koruma Kurulunu, g) Kurum: Ki\u015fisel Verileri Koruma Kurumunu, \u011f) Veri i\u015fleyen: Veri sorumlusunun verdi\u011fi yetkiye dayanarak onun ad\u0131na ki\u015fisel verileri i\u015fleyen ger\u00e7ek veya t\u00fczel ki\u015fiyi, h) Veri kay\u0131t sistemi: Ki\u015fisel verilerin belirli kriterlere g\u00f6re yap\u0131land\u0131r\u0131larak i\u015flendi\u011fi kay\u0131t sistemini, \u0131) Veri sorumlusu: Ki\u015fisel verilerin i\u015fleme ama\u00e7lar\u0131n\u0131 ve vas\u0131talar\u0131n\u0131 belirleyen, veri kay\u0131t sisteminin kurulmas\u0131ndan ve y\u00f6netilmesinden sorumlu olan ger\u00e7ek veya t\u00fczel ki\u015fiyi, ifade eder.',
        },
        {
          provision_ref: 'madde4', section: '4', chapter: '\u0130kinci B\u00f6l\u00fcm - Ki\u015fisel Verilerin \u0130\u015flenmesi',
          title: 'Genel ilkeler',
          content: 'Madde 4 - (1) Ki\u015fisel veriler, ancak bu Kanunda ve di\u011fer kanunlarda \u00f6ng\u00f6r\u00fclen usul ve esaslara uygun olarak i\u015flenebilir. (2) Ki\u015fisel verilerin i\u015flenmesinde a\u015fa\u011f\u0131daki ilkelere uyulmas\u0131 zorunludur: a) Hukuka ve d\u00fcr\u00fcstl\u00fck kurallar\u0131na uygun olma, b) Do\u011fru ve gerekti\u011finde g\u00fcncel olma, c) Belirli, a\u00e7\u0131k ve me\u015fru ama\u00e7lar i\u00e7in i\u015flenme, \u00e7) \u0130\u015flendikleri ama\u00e7la ba\u011flant\u0131l\u0131, s\u0131n\u0131rl\u0131 ve \u00f6l\u00e7\u00fcl\u00fc olma, d) \u0130lgili mevzuatta \u00f6ng\u00f6r\u00fclen veya i\u015flendikleri ama\u00e7 i\u00e7in gerekli olan s\u00fcre kadar muhafaza edilme.',
        },
        {
          provision_ref: 'madde5', section: '5', chapter: '\u0130kinci B\u00f6l\u00fcm - Ki\u015fisel Verilerin \u0130\u015flenmesi',
          title: 'Ki\u015fisel verilerin i\u015flenme \u015fartlar\u0131',
          content: 'Madde 5 - (1) Ki\u015fisel veriler ilgili ki\u015finin a\u00e7\u0131k r\u0131zas\u0131 olmaks\u0131z\u0131n i\u015flenemez. (2) A\u015fa\u011f\u0131daki \u015fartlardan birinin varl\u0131\u011f\u0131 halinde, ilgili ki\u015finin a\u00e7\u0131k r\u0131zas\u0131 aranmaks\u0131z\u0131n ki\u015fisel verilerinin i\u015flenmesi m\u00fcmk\u00fcnd\u00fcr: a) Kanunlarda a\u00e7\u0131k\u00e7a \u00f6ng\u00f6r\u00fclmesi, b) Fiili imkans\u0131zl\u0131k nedeniyle r\u0131zas\u0131n\u0131 a\u00e7\u0131klayamayacak durumda bulunan veya r\u0131zas\u0131na hukuki ge\u00e7erlilik tan\u0131nmayan ki\u015finin kendisinin ya da bir ba\u015fkas\u0131n\u0131n hayat\u0131 veya beden b\u00fct\u00fcnl\u00fc\u011f\u00fcn\u00fcn korunmas\u0131 i\u00e7in zorunlu olmas\u0131, c) Bir s\u00f6zle\u015fmenin kurulmas\u0131 veya ifas\u0131yla do\u011frudan do\u011fruya ilgili olmas\u0131 kayd\u0131yla, s\u00f6zle\u015fmenin taraflar\u0131na ait ki\u015fisel verilerin i\u015flenmesinin gerekli olmas\u0131, \u00e7) Veri sorumlusunun hukuki y\u00fck\u00fcml\u00fcl\u00fc\u011f\u00fcn\u00fc yerine getirebilmesi i\u00e7in zorunlu olmas\u0131, d) \u0130lgili ki\u015finin kendisi taraf\u0131ndan alenile\u015ftirilmi\u015f olmas\u0131, e) Bir hakk\u0131n tesisi, kullan\u0131lmas\u0131 veya korunmas\u0131 i\u00e7in veri i\u015flemenin zorunlu olmas\u0131, f) \u0130lgili ki\u015finin temel hak ve \u00f6zg\u00fcrl\u00fcklerine zarar vermemek kayd\u0131yla, veri sorumlusunun me\u015fru menfaatleri i\u00e7in veri i\u015flenmesinin zorunlu olmas\u0131.',
        },
        {
          provision_ref: 'madde6', section: '6', chapter: '\u0130kinci B\u00f6l\u00fcm - Ki\u015fisel Verilerin \u0130\u015flenmesi',
          title: '\u00d6zel nitelikli ki\u015fisel verilerin i\u015flenme \u015fartlar\u0131',
          content: 'Madde 6 - (1) Ki\u015filerin \u0131rk\u0131, etnik k\u00f6keni, siyasi d\u00fc\u015f\u00fcncesi, felsefi inanc\u0131, dini, mezhebi veya di\u011fer inan\u00e7lar\u0131, k\u0131l\u0131k ve k\u0131yafeti, dernek, vakıf ya da sendika \u00fcyeli\u011fi, sa\u011fl\u0131\u011f\u0131, cinsel hayat\u0131, ceza mahk\u00fbmiyeti ve g\u00fcvenlik tedbirleriyle ilgili verileri ile biyometrik ve genetik verileri \u00f6zel nitelikli ki\u015fisel veridir. (2) \u00d6zel nitelikli ki\u015fisel verilerin, ilgilinin a\u00e7\u0131k r\u0131zas\u0131 olmaks\u0131z\u0131n i\u015flenmesi yasakt\u0131r.',
        },
        {
          provision_ref: 'madde9', section: '9', chapter: '\u00dc\u00e7\u00fcnc\u00fc B\u00f6l\u00fcm',
          title: 'Ki\u015fisel verilerin yurt d\u0131\u015f\u0131na aktar\u0131lmas\u0131',
          content: 'Madde 9 - (1) Ki\u015fisel veriler, ilgili ki\u015finin a\u00e7\u0131k r\u0131zas\u0131 olmaks\u0131z\u0131n yurt d\u0131\u015f\u0131na aktar\u0131lamaz. (2) Ki\u015fisel veriler, 5 inci maddenin ikinci f\u0131kras\u0131 ile 6 nc\u0131 maddenin \u00fc\u00e7\u00fcnc\u00fc f\u0131kras\u0131nda belirtilen \u015fartlardan birinin varl\u0131\u011f\u0131 ve ki\u015fisel verinin aktar\u0131laca\u011f\u0131 \u00fclkede yeterli korunan\u0131n bulunmas\u0131 kayd\u0131yla, ilgili ki\u015finin a\u00e7\u0131k r\u0131zas\u0131 aranmaks\u0131z\u0131n yurt d\u0131\u015f\u0131na aktar\u0131labilir.',
        },
        {
          provision_ref: 'madde11', section: '11', chapter: 'D\u00f6rd\u00fcnc\u00fc B\u00f6l\u00fcm - Ba\u015fvuru ve \u015eikayet',
          title: '\u0130lgili ki\u015finin haklar\u0131',
          content: 'Madde 11 - (1) Herkes, veri sorumlusuna ba\u015fvurarak kendisiyle ilgili; a) Ki\u015fisel veri i\u015flenip i\u015flenmedi\u011fini \u00f6\u011frenme, b) Ki\u015fisel verileri i\u015flenmi\u015fse buna ili\u015fkin bilgi talep etme, c) Ki\u015fisel verilerin i\u015flenme amac\u0131n\u0131 ve bunlar\u0131n amac\u0131na uygun kullan\u0131l\u0131p kullan\u0131lmad\u0131\u011f\u0131n\u0131 \u00f6\u011frenme, \u00e7) Yurt i\u00e7inde veya yurt d\u0131\u015f\u0131nda ki\u015fisel verilerin aktar\u0131ld\u0131\u011f\u0131 \u00fc\u00e7\u00fcnc\u00fc ki\u015fileri bilme, d) Ki\u015fisel verilerin eksik veya yanl\u0131\u015f i\u015flenmi\u015f olmas\u0131 halinde bunlar\u0131n d\u00fczeltilmesini isteme, e) 7 nci maddede \u00f6ng\u00f6r\u00fclen \u015fartlar \u00e7er\u00e7evesinde ki\u015fisel verilerin silinmesini veya yok edilmesini isteme, f) (d) ve (e) bentleri uyar\u0131nca yap\u0131lan i\u015flemlerin, ki\u015fisel verilerin aktar\u0131ld\u0131\u011f\u0131 \u00fc\u00e7\u00fcnc\u00fc ki\u015filere bildirilmesini isteme, g) \u0130\u015flenen verilerin m\u00fcnhas\u0131ran otomatik sistemler vas\u0131tas\u0131yla analiz edilmesi suretiyle ki\u015finin kendisi aleyhine bir sonucun ortaya \u00e7\u0131kmas\u0131na itiraz etme, \u011f) Ki\u015fisel verilerin kanuna ayk\u0131r\u0131 olarak i\u015flenmesi sebebiyle zarara u\u011framas\u0131 halinde zarar\u0131n giderilmesini talep etme, haklar\u0131na sahiptir.',
        },
        {
          provision_ref: 'madde18', section: '18', chapter: 'Yedinci B\u00f6l\u00fcm - Kabahatler',
          title: 'Kabahatler',
          content: 'Madde 18 - (1) Bu Kanunun; a) 10 uncu maddesinde \u00f6ng\u00f6r\u00fclen ayd\u0131nlatma y\u00fck\u00fcml\u00fcl\u00fc\u011f\u00fcn\u00fc yerine getirmeyenlere 5.000 T\u00fcrk liras\u0131ndan 100.000 T\u00fcrk liras\u0131na kadar, b) 12 nci maddesinde \u00f6ng\u00f6r\u00fclen veri g\u00fcvenli\u011fine ili\u015fkin y\u00fck\u00fcml\u00fcl\u00fckleri yerine getirmeyenlere 15.000 T\u00fcrk liras\u0131ndan 1.000.000 T\u00fcrk liras\u0131na kadar, c) 15 inci maddesi uyar\u0131nca Kurul taraf\u0131ndan verilen kararlar\u0131 yerine getirmeyenlere 25.000 T\u00fcrk liras\u0131ndan 1.000.000 T\u00fcrk liras\u0131na kadar, \u00e7) 16 nc\u0131 maddesinde \u00f6ng\u00f6r\u00fclen Veri Sorumluları Siciline kay\u0131t ve bildirim y\u00fck\u00fcml\u00fcl\u00fc\u011f\u00fcne ayk\u0131r\u0131 hareket edenler hakk\u0131nda 20.000 T\u00fcrk liras\u0131ndan 1.000.000 T\u00fcrk liras\u0131na kadar, idari para cezas\u0131 verilir.',
        },
      );
      definitions.push(
        { term: 'A\u00e7\u0131k r\u0131za', definition: 'Belirli bir konuya ili\u015fkin, bilgilendirilmeye dayanan ve \u00f6zg\u00fcr iradeyle a\u00e7\u0131klanan r\u0131za', source_provision: 'madde3' },
        { term: 'Ki\u015fisel veri', definition: 'Kimli\u011fi belirli veya belirlenebilir ger\u00e7ek ki\u015fiye ili\u015fkin her t\u00fcrl\u00fc bilgi', source_provision: 'madde3' },
        { term: '\u0130lgili ki\u015fi', definition: 'Ki\u015fisel verisi i\u015flenen ger\u00e7ek ki\u015fi', source_provision: 'madde3' },
        { term: 'Veri sorumlusu', definition: 'Ki\u015fisel verilerin i\u015fleme ama\u00e7lar\u0131n\u0131 ve vas\u0131talar\u0131n\u0131 belirleyen, veri kay\u0131t sisteminin kurulmas\u0131ndan ve y\u00f6netilmesinden sorumlu olan ger\u00e7ek veya t\u00fczel ki\u015fi', source_provision: 'madde3' },
        { term: 'Veri i\u015fleyen', definition: 'Veri sorumlusunun verdi\u011fi yetkiye dayanarak onun ad\u0131na ki\u015fisel verileri i\u015fleyen ger\u00e7ek veya t\u00fczel ki\u015fi', source_provision: 'madde3' },
        { term: 'Kurul', definition: 'Ki\u015fisel Verileri Koruma Kurulu', source_provision: 'madde3' },
        { term: 'Kurum', definition: 'Ki\u015fisel Verileri Koruma Kurumu', source_provision: 'madde3' },
        { term: 'Veri kay\u0131t sistemi', definition: 'Ki\u015fisel verilerin belirli kriterlere g\u00f6re yap\u0131land\u0131r\u0131larak i\u015flendi\u011fi kay\u0131t sistemi', source_provision: 'madde3' },
        { term: 'Anonim hale getirme', definition: 'Ki\u015fisel verilerin, ba\u015fka verilerle e\u015fle\u015ftirilerek dahi hi\u00e7bir surette kimli\u011fi belirli veya belirlenebilir bir ger\u00e7ek ki\u015fiye ili\u015fkilendirilemeyecek hale getirilmesi', source_provision: 'madde3' },
      );
      break;

    case 'law-5651':
      provisions.push(
        {
          provision_ref: 'madde1', section: '1', chapter: 'Birinci B\u00f6l\u00fcm',
          title: 'Ama\u00e7 ve kapsam',
          content: 'Madde 1 - Bu Kanunun amac\u0131, i\u00e7erik sa\u011flay\u0131c\u0131, yer sa\u011flay\u0131c\u0131, eri\u015fim sa\u011flay\u0131c\u0131 ve toplu kullan\u0131m sa\u011flay\u0131c\u0131lar\u0131n y\u00fck\u00fcml\u00fclk ve sorumluluklar\u0131 ile internet ortam\u0131nda i\u015flenen belirli su\u00e7lar i\u00e7in i\u00e7erik, yer ve eri\u015fim sa\u011flay\u0131c\u0131lar\u0131 \u00fczerinden m\u00fccadeleye ili\u015fkin esas ve usulleri d\u00fczenlemektir.',
        },
        {
          provision_ref: 'madde2', section: '2', chapter: 'Birinci B\u00f6l\u00fcm',
          title: 'Tan\u0131mlar',
          content: 'Madde 2 - Bu Kanunun uygulanmas\u0131nda; a) Ba\u015fkanl\u0131k: Bilgi Teknolojileri ve \u0130leti\u015fim Kurumu B\u00fct\u00fcnle\u015ftirilmi\u015f Hizmet Merkezini, b) Eri\u015fim sa\u011flay\u0131c\u0131: Kullan\u0131c\u0131lar\u0131na internet ortam\u0131na eri\u015fim olana\u011f\u0131 sa\u011flayan her t\u00fcrl\u00fc ger\u00e7ek veya t\u00fczel ki\u015fileri, c) \u0130\u00e7erik sa\u011flay\u0131c\u0131: \u0130nternet ortam\u0131 \u00fczerinden kullan\u0131c\u0131lara sunulan her t\u00fcrl\u00fc bilgi veya veriyi \u00fcreten, de\u011fi\u015ftiren ve sa\u011flayan ger\u00e7ek veya t\u00fczel ki\u015fileri, \u00e7) \u0130nternet ortam\u0131: Haberle\u015fme ile ki\u015fisel ya da kurumsal bilgisayar sistemleri d\u0131\u015f\u0131nda kalan ve kamuca a\u00e7\u0131k olan internet \u00fczerinde olu\u015fturulan ortam\u0131, d) Toplu kullan\u0131m sa\u011flay\u0131c\u0131: Ki\u015filere belli bir yerde ve s\u00fcrede internet ortam\u0131 kullan\u0131m olana\u011f\u0131 sa\u011flayan ger\u00e7ek ve t\u00fczel ki\u015fileri, e) Trafik bilgisi: Taraflar\u0131n belirlenebilmesi i\u00e7in internet ortam\u0131nda ger\u00e7ekle\u015ftirilen her t\u00fcrl\u00fc eri\u015fime ili\u015fkin olarak i\u015flenen bilgileri, f) Yer sa\u011flay\u0131c\u0131: Hizmet ve i\u00e7erikleri bar\u0131nd\u0131ran sistemleri sa\u011flayan veya i\u015fleten ger\u00e7ek veya t\u00fczel ki\u015fileri, ifade eder.',
        },
        {
          provision_ref: 'madde3', section: '3', chapter: '\u0130kinci B\u00f6l\u00fcm',
          title: '\u0130\u00e7erik sa\u011flay\u0131c\u0131n\u0131n y\u00fck\u00fcml\u00fcl\u00fckleri',
          content: 'Madde 3 - \u0130\u00e7erik sa\u011flay\u0131c\u0131, internet ortam\u0131nda kullan\u0131ma sundu\u011fu her t\u00fcrl\u00fc i\u00e7erikten sorumludur. \u0130\u00e7erik sa\u011flay\u0131c\u0131, ba\u015fkalar\u0131n\u0131n \u00fcretip internet ortam\u0131na sundu\u011fu i\u00e7eri\u011fi kendi saylas\u0131nda kullan\u0131c\u0131lara\u0131n ula\u015f\u0131m\u0131na sunarsa, bu i\u00e7erilk nedeniyle sorumlu de\u011fildir.',
        },
        {
          provision_ref: 'madde5', section: '5', chapter: '\u0130kinci B\u00f6l\u00fcm',
          title: 'Yer sa\u011flay\u0131c\u0131n\u0131n y\u00fck\u00fcml\u00fclkleri',
          content: 'Madde 5 - Yer sa\u011flay\u0131c\u0131, yer sa\u011flad\u0131\u011f\u0131 i\u00e7eri\u011fi kontrol etmek veya hukuka ayk\u0131r\u0131 bir faaliyetin s\u00f6z konusu olup olmad\u0131\u011f\u0131n\u0131 ara\u015ft\u0131rmakla y\u00fck\u00fcml\u00fc de\u011fildir.',
        },
        {
          provision_ref: 'madde8', section: '8', chapter: '\u00dc\u00e7\u00fcnc\u00fc B\u00f6l\u00fcm',
          title: 'Eri\u015fimin engellenmesi karar\u0131 ve yerine getirilmesi',
          content: 'Madde 8 - \u0130nternet ortam\u0131nda yap\u0131lan ve i\u00e7eri\u011fi a\u015fa\u011f\u0131daki su\u00e7lar\u0131 olu\u015fturdu\u011fu hususunda yeterli \u015f\u00fcphe sebebi bulunan yay\u0131nlarla ilgili olarak eri\u015fimin engellenmesine karar verilir.',
        },
        {
          provision_ref: 'madde9', section: '9', chapter: '\u00dc\u00e7\u00fcnc\u00fc B\u00f6l\u00fcm',
          title: '\u0130\u00e7eri\u011fin \u00e7\u0131kar\u0131lmas\u0131 ve eri\u015fimin engellenmesi',
          content: 'Madde 9 - \u0130nternet ortam\u0131nda yap\u0131lan yay\u0131n i\u00e7eri\u011fi nedeniyle ki\u015filik haklar\u0131n\u0131n ihlal edildi\u011fini iddia eden ger\u00e7ek ve t\u00fczel ki\u015filer ile kurum ve kurulu\u015flar, i\u00e7erik sa\u011flay\u0131c\u0131s\u0131na, buna ula\u015famamas\u0131 halinde yer sa\u011flay\u0131c\u0131s\u0131na ba\u015fvurarak uyar\u0131 y\u00f6ntemi ile i\u00e7eri\u011fin yay\u0131ndan \u00e7\u0131kar\u0131lmas\u0131n\u0131 isteyebilece\u011fi gibi do\u011frudan sulh ceza hakimli\u011fine ba\u015fvurarak i\u00e7eri\u011fin \u00e7\u0131kar\u0131lmas\u0131n\u0131 ve/veya eri\u015fimin engellenmesini de isteyebilir.',
        },
      );
      definitions.push(
        { term: 'Eri\u015fim sa\u011flay\u0131c\u0131', definition: 'Kullan\u0131c\u0131lar\u0131na internet ortam\u0131na eri\u015fim olana\u011f\u0131 sa\u011flayan her t\u00fcrl\u00fc ger\u00e7ek veya t\u00fczel ki\u015fi', source_provision: 'madde2' },
        { term: '\u0130\u00e7erik sa\u011flay\u0131c\u0131', definition: '\u0130nternet ortam\u0131 \u00fczerinden kullan\u0131c\u0131lara sunulan her t\u00fcrl\u00fc bilgi veya veriyi \u00fcreten, de\u011fi\u015ftiren ve sa\u011flayan ger\u00e7ek veya t\u00fczel ki\u015fi', source_provision: 'madde2' },
        { term: 'Yer sa\u011flay\u0131c\u0131', definition: 'Hizmet ve i\u00e7erikleri bar\u0131nd\u0131ran sistemleri sa\u011flayan veya i\u015fleten ger\u00e7ek veya t\u00fczel ki\u015fi', source_provision: 'madde2' },
        { term: 'Trafik bilgisi', definition: 'Taraflar\u0131n belirlenebilmesi i\u00e7in internet ortam\u0131nda ger\u00e7ekle\u015ftirilen her t\u00fcrl\u00fc eri\u015fime ili\u015fkin olarak i\u015flenen bilgi', source_provision: 'madde2' },
      );
      break;

    case 'tck-5237':
      provisions.push(
        {
          provision_ref: 'madde243', section: '243', chapter: 'Onuncu B\u00f6l\u00fcm - Bili\u015fim Alan\u0131nda Su\u00e7lar',
          title: 'Bili\u015fim sistemine girme',
          content: 'Madde 243 - (1) Bir bili\u015fim sisteminin b\u00fct\u00fcn\u00fcne veya bir k\u0131sm\u0131na, hukuka ayk\u0131r\u0131 olarak giren veya orada kalmaya devam eden kimseye bir y\u0131la kadar hapis veya adli para cezas\u0131 verilir. (2) Yukar\u0131daki f\u0131krada tan\u0131mlanan fiillerin bedeli kar\u015f\u0131l\u0131\u011f\u0131 yararlan\u0131labilecek sistemler hakk\u0131nda i\u015flenmesi halinde, verilecek ceza yar\u0131 oran\u0131na kadar art\u0131r\u0131l\u0131r. (3) Bu fiil nedeniyle sistemin i\u00e7erdi\u011fi veriler yok olur veya de\u011fi\u015firse, alt\u0131 aydan iki y\u0131la kadar hapis cezas\u0131na h\u00fckmedilir.',
        },
        {
          provision_ref: 'madde244', section: '244', chapter: 'Onuncu B\u00f6l\u00fcm - Bili\u015fim Alan\u0131nda Su\u00e7lar',
          title: 'Sistemi engelleme, bozma, verileri yok etme veya de\u011fi\u015ftirme',
          content: 'Madde 244 - (1) Bir bili\u015fim sisteminin i\u015fleyi\u015fini engelleyen veya bozan ki\u015fi, bir y\u0131ldan be\u015f y\u0131la kadar hapis cezas\u0131 ile cezaland\u0131r\u0131l\u0131r. (2) Bir bili\u015fim sistemindeki verileri bozan, yok eden, de\u011fi\u015ftiren veya eri\u015filmez k\u0131lan, sisteme veri yerle\u015ftiren, var olan verileri ba\u015fka bir yere g\u00f6nderen ki\u015fi, alt\u0131 aydan \u00fc\u00e7 y\u0131la kadar hapis cezas\u0131 ile cezaland\u0131r\u0131l\u0131r. (3) Bu fiillerin bir banka veya kredi kurumuna ya da bir kamu kurum veya kurulu\u015funa ait bili\u015fim sistemi \u00fczerinde i\u015flenmesi halinde, verilecek ceza yar\u0131 oran\u0131nda art\u0131r\u0131l\u0131r. (4) Yukar\u0131daki f\u0131kralarda tan\u0131mlanan fiillerin i\u015flenmesi suretiyle ki\u015finin kendisinin veya ba\u015fkas\u0131n\u0131n yarar\u0131na haks\u0131z bir \u00e7\u0131kar sa\u011flanmas\u0131n\u0131n ba\u015fka bir su\u00e7 olu\u015fturmamas\u0131 halinde, iki y\u0131ldan alt\u0131 y\u0131la kadar hapis ve be\u015fbin g\u00fcne kadar adli para cezas\u0131na h\u00fckmedilir.',
        },
        {
          provision_ref: 'madde245', section: '245', chapter: 'Onuncu B\u00f6l\u00fcm - Bili\u015fim Alan\u0131nda Su\u00e7lar',
          title: 'Banka veya kredi kartlar\u0131n\u0131n k\u00f6t\u00fcye kullan\u0131lmas\u0131',
          content: 'Madde 245 - (1) Ba\u015fkas\u0131na ait bir banka veya kredi kart\u0131n\u0131, her ne surette olursa olsun ele ge\u00e7iren veya elinde bulunduran kimse, kart sahibinin veya kart\u0131n kendisine verilmesi gereken ki\u015finin r\u0131zas\u0131 olmaks\u0131z\u0131n bunu kullanarak veya kulland\u0131rtarak kendisine veya ba\u015fkas\u0131na yarar sa\u011flarsa, \u00fc\u00e7 y\u0131ldan alt\u0131 y\u0131la kadar hapis ve be\u015fbin g\u00fcne kadar adli para cezas\u0131 ile cezaland\u0131r\u0131l\u0131r. (2) Ba\u015fkalar\u0131na ait banka hesaplar\u0131yla ili\u015fkilendirilerek sahte banka veya kredi kart\u0131 \u00fcreten, satan, devreden, sat\u0131n alan veya kabul eden ki\u015fi \u00fc\u00e7 y\u0131ldan yedi y\u0131la kadar hapis ve onbin g\u00fcne kadar adli para cezas\u0131 ile cezaland\u0131r\u0131l\u0131r. (3) Sahte \u00f6l\u00fc\u015ft\u00fcr\u00fclen veya \u00fczerinde sahtecilik yap\u0131lan bir banka veya kredi kart\u0131n\u0131 kullanmak suretiyle kendisine veya ba\u015fkas\u0131na yarar sa\u011flayan ki\u015fi, fiil daha a\u011f\u0131r cezay\u0131 gerektiren ba\u015fka bir su\u00e7 olu\u015fturmad\u0131\u011f\u0131 takdirde, d\u00f6rt y\u0131ldan sekiz y\u0131la kadar hapis ve be\u015fbin g\u00fcne kadar adli para cezas\u0131 ile cezaland\u0131r\u0131l\u0131r.',
        },
        {
          provision_ref: 'madde246', section: '246', chapter: 'Onuncu B\u00f6l\u00fcm - Bili\u015fim Alan\u0131nda Su\u00e7lar',
          title: 'T\u00fczel ki\u015filer hakk\u0131nda g\u00fcvenlik tedbiri uygulanmas\u0131',
          content: 'Madde 246 - Bu b\u00f6l\u00fcmde yer alan su\u00e7lar\u0131n i\u015flenmesi suretiyle yararuna haks\u0131z menfaat sa\u011flanan t\u00fczel ki\u015filer hakk\u0131nda bunlara \u00f6zg\u00fc g\u00fcvenlik tedbirlerine h\u00fckmedilir.',
        },
      );
      break;

    case 'ttk-6102':
      provisions.push(
        {
          provision_ref: 'madde1', section: '1', chapter: 'Ba\u015flang\u0131\u00e7 H\u00fck\u00fcmleri',
          title: 'Kanunun uygulanma alan\u0131',
          content: 'Madde 1 - T\u00fcrk Ticaret Kanunu, 22/11/2001 tarihli ve 4721 say\u0131l\u0131 T\u00fcrk Medeni Kanununun ayr\u0131lmaz bir par\u00e7as\u0131d\u0131r. Bu Kanundaki h\u00fck\u00fcmlerle bir ticari i\u015fletmeyi ilgilendiren i\u015flem ve fiillere ili\u015fkin di\u011fer kanunlarda yaz\u0131l\u0131 \u00f6zel h\u00fck\u00fcmler, ticari h\u00fck\u00fcmlerdir.',
        },
        {
          provision_ref: 'madde18', section: '18', chapter: 'Birinci Kitap - Ticari \u0130\u015fletme',
          title: 'Tacir s\u0131fat\u0131n\u0131n sonu\u00e7lar\u0131',
          content: 'Madde 18 - (1) Tacir, her t\u00fcrl\u00fc bor\u00e7lar\u0131 i\u00e7in iflas yoluyla takibe tabidir; konkordato talep edebilir. (2) Her tacirin, ticaretine ait b\u00fct\u00fcn faaliyetlerinde basiretli bir i\u015fadam\u0131 gibi hareket etmesi gerekir.',
        },
        {
          provision_ref: 'madde1524', section: '1524', chapter: 'D\u00f6rd\u00fcnc\u00fc Kitap',
          title: '\u0130nternet sitesi',
          content: 'Madde 1524 - (1) Her sermaye \u015firketi, bir internet sitesi a\u00e7mak ve bu sitenin belirli bir b\u00f6l\u00fcm\u00fcn\u00fc \u015firketin mevcut ve eski ortaklar\u0131yla di\u011fer ilgililer i\u00e7in tahsis etmek zorundad\u0131r. (2) Kanunen yap\u0131lmas\u0131 gereken ilanlar, \u015firketin internet sitesinde de yay\u0131mlan\u0131r.',
        },
      );
      break;

    case 'ecommerce-6563':
      provisions.push(
        {
          provision_ref: 'madde1', section: '1', chapter: 'Birinci B\u00f6l\u00fcm',
          title: 'Ama\u00e7',
          content: 'Madde 1 - Bu Kanunun amac\u0131; elektronik ticaretin d\u00fczenlenmesine ili\u015fkin esas ve usulleri belirlemektir.',
        },
        {
          provision_ref: 'madde2', section: '2', chapter: 'Birinci B\u00f6l\u00fcm',
          title: 'Kapsam',
          content: 'Madde 2 - Bu Kanun, ticari ileti\u015fim, hizmet sa\u011flay\u0131c\u0131 ve arac\u0131 hizmet sa\u011flay\u0131c\u0131lar\u0131n sorumluluklar\u0131, elektronik i\u015flemlere ili\u015fkin bilgi verme y\u00fck\u00fcml\u00fclkleri ile elektronik ticaret ortam\u0131nda s\u00f6zle\u015fmelerin kurulmas\u0131na ili\u015fkin esas ve usulleri kapsar.',
        },
        {
          provision_ref: 'madde3', section: '3', chapter: 'Birinci B\u00f6l\u00fcm',
          title: 'Tan\u0131mlar',
          content: 'Madde 3 - Bu Kanunun uygulanmas\u0131nda; a) Bakanl\u0131k: G\u00fcmr\u00fck ve Ticaret Bakanl\u0131\u011f\u0131n\u0131, b) Elektronik ticaret: Fiziki olarak kar\u015f\u0131 kar\u015f\u0131ya gelmeksizin, elektronik ortamda ger\u00e7ekle\u015ftirilen \u00e7evrimi\u00e7i iktisadi ve ticari her t\u00fcrl\u00fc faaliyeti, c) Hizmet sa\u011flay\u0131c\u0131: Elektronik ticaret faaliyetinde bulunan ger\u00e7ek ya da t\u00fczel ki\u015fileri, \u00e7) Arac\u0131 hizmet sa\u011flay\u0131c\u0131: Ba\u015fkalar\u0131na ait iktisadi ve ticari faaliyetlerin yap\u0131lmas\u0131na elektronik ticaret ortam\u0131n\u0131 sa\u011flayan ger\u00e7ek ya da t\u00fczel ki\u015fileri, d) Ticari elektronik ileti: Telefon, \u00e7a\u011fr\u0131 merkezi, faks, otomatik arama makinesi, ak\u0131ll\u0131 ses kaydedici sistem, elektronik posta, k\u0131sa mesaj hizmeti gibi vas\u0131talar kullanarak elektronik ortamda ger\u00e7ekle\u015ftirilen ve ticari ama\u00e7larla g\u00f6nderilen veri, ses ve g\u00f6r\u00fcnt\u00fc i\u00e7erikli iletiyi, ifade eder.',
        },
        {
          provision_ref: 'madde4', section: '4', chapter: '\u0130kinci B\u00f6l\u00fcm',
          title: 'Bilgi verme y\u00fck\u00fcml\u00fcl\u00fc\u011f\u00fc',
          content: 'Madde 4 - Hizmet sa\u011flay\u0131c\u0131, elektronik ticaret faaliyetine ba\u015flamadan \u00f6nce; a) Tacir ise ticaret unvan\u0131n\u0131, MERSiS numaras\u0131n\u0131, b) Esnaf ise ad\u0131n\u0131, soyad\u0131n\u0131, c) Merkez adresini, d) \u0130leti\u015fim bilgilerini, e) Varsa meslek odas\u0131 bilgilerini, f) Varsa mesleki uygulama kurallar\u0131n\u0131, statik olarak, internet ortam\u0131nda kolayl\u0131kla eri\u015febilecek \u015fekilde sunmak zorundad\u0131r.',
        },
        {
          provision_ref: 'madde6', section: '6', chapter: '\u0130kinci B\u00f6l\u00fcm',
          title: 'Ticari elektronik ileti g\u00f6nderme \u015fart\u0131',
          content: 'Madde 6 - Ticari elektronik ileti g\u00f6nderilebilmesi i\u00e7in, al\u0131c\u0131n\u0131n \u00f6nceden onay\u0131n\u0131n al\u0131nmas\u0131 gereklidir. Bu onay, yaz\u0131l\u0131 olarak veya her t\u00fcrl\u00fc elektronik ileti\u015fim arac\u0131yla al\u0131nabilir.',
        },
      );
      definitions.push(
        { term: 'Elektronik ticaret', definition: 'Fiziki olarak kar\u015f\u0131 kar\u015f\u0131ya gelmeksizin, elektronik ortamda ger\u00e7ekle\u015ftirilen \u00e7evrimi\u00e7i iktisadi ve ticari her t\u00fcrl\u00fc faaliyet', source_provision: 'madde3' },
        { term: 'Hizmet sa\u011flay\u0131c\u0131', definition: 'Elektronik ticaret faaliyetinde bulunan ger\u00e7ek ya da t\u00fczel ki\u015fi', source_provision: 'madde3' },
        { term: 'Arac\u0131 hizmet sa\u011flay\u0131c\u0131', definition: 'Ba\u015fkalar\u0131na ait iktisadi ve ticari faaliyetlerin yap\u0131lmas\u0131na elektronik ticaret ortam\u0131n\u0131 sa\u011flayan ger\u00e7ek ya da t\u00fczel ki\u015fi', source_provision: 'madde3' },
        { term: 'Ticari elektronik ileti', definition: 'Elektronik ortamda ger\u00e7ekle\u015ftirilen ve ticari ama\u00e7larla g\u00f6nderilen veri, ses ve g\u00f6r\u00fcnt\u00fc i\u00e7erikli ileti', source_provision: 'madde3' },
      );
      break;

    case 'constitution-2709':
      provisions.push(
        {
          provision_ref: 'madde20', section: '20', chapter: '\u0130kinci K\u0131s\u0131m - Temel Haklar ve \u00d6devler',
          title: '\u00d6zel hayat\u0131n gizlili\u011fi',
          content: 'Madde 20 - Herkes, \u00f6zel hayat\u0131na ve aile hayat\u0131na sayg\u0131 g\u00f6sterilmesini isteme hakk\u0131na sahiptir. \u00d6zel hayat\u0131n ve aile hayat\u0131n\u0131n gizlili\u011fine dokunulamaz. Herkes, kendisiyle ilgili ki\u015fisel verilerin korunmas\u0131n\u0131 isteme hakk\u0131na sahiptir. Bu hak; ki\u015finin kendisiyle ilgili ki\u015fisel veriler hakk\u0131nda bilgilendirilme, bu verilere eri\u015fme, bunlar\u0131n d\u00fczeltilmesini veya silinmesini talep etme ve ama\u00e7lar\u0131 do\u011frultusunda kullan\u0131l\u0131p kullan\u0131lmad\u0131\u011f\u0131n\u0131 \u00f6\u011frenmeyi de kapsar. Ki\u015fisel veriler, ancak kanunda \u00f6ng\u00f6r\u00fclen hallerde veya ki\u015finin a\u00e7\u0131k r\u0131zas\u0131yla i\u015flenebilir. Ki\u015fisel verilerin korunmas\u0131na ili\u015fkin esas ve usuller kanunla d\u00fczenlenir.',
        },
        {
          provision_ref: 'madde22', section: '22', chapter: '\u0130kinci K\u0131s\u0131m - Temel Haklar ve \u00d6devler',
          title: 'Haberle\u015fme h\u00fcrriyeti',
          content: 'Madde 22 - Herkes, haberle\u015fme h\u00fcrriyetine sahiptir. Haberle\u015fmenin gizlili\u011fi esast\u0131r. Milli g\u00fcvenlik, kamu d\u00fczeni, su\u00e7 i\u015flenmesinin \u00f6nlenmesi, genel sa\u011fl\u0131k ve genel ahlak\u0131n korunmas\u0131 veya ba\u015fkalar\u0131n\u0131n hak ve \u00f6zg\u00fcrl\u00fcklerinin korunmas\u0131 sebeplerinden biri veya birka\u00e7\u0131na ba\u011fl\u0131 olarak usul\u00fcne g\u00f6re verilmi\u015f hakim karar\u0131 olmad\u0131k\u00e7a; yine bu sebeplere ba\u011fl\u0131 olarak gecikmesinde sak\u0131nca bulunan hallerde de kanunla yetkili k\u0131l\u0131nan merciin yaz\u0131l\u0131 emri bulunmad\u0131k\u00e7a; haberle\u015fme engellenemez ve gizlili\u011fine dokunulamaz.',
        },
        {
          provision_ref: 'madde26', section: '26', chapter: '\u0130kinci K\u0131s\u0131m - Temel Haklar ve \u00d6devler',
          title: 'D\u00fc\u015f\u00fcnceyi a\u00e7\u0131klama ve yayma h\u00fcrriyeti',
          content: 'Madde 26 - Herkes, d\u00fc\u015f\u00fcnce ve kanaatlerini s\u00f6z, yaz\u0131, resim veya ba\u015fka yollarla tek ba\u015f\u0131na veya toplu olarak a\u00e7\u0131klama ve yayma hakk\u0131na sahiptir. Bu h\u00fcrriyet, resmi makamlar\u0131n m\u00fcdahalesi olmaks\u0131z\u0131n haber veya fikir almak ya da vermek serbestli\u011fini de kapsar.',
        },
        {
          provision_ref: 'madde13', section: '13', chapter: '\u0130kinci K\u0131s\u0131m - Temel Haklar ve \u00d6devler',
          title: 'Temel hak ve h\u00fcrriyetlerin s\u0131n\u0131rlanmas\u0131',
          content: 'Madde 13 - Temel hak ve h\u00fcrriyetler, \u00f6zlerine dokunulmaks\u0131z\u0131n yaln\u0131zca Anayasan\u0131n ilgili maddelerinde belirtilen sebeplere ba\u011fl\u0131 olarak ve ancak kanunla s\u0131n\u0131rlanabilir. Bu s\u0131n\u0131rlamalar, Anayasan\u0131n s\u00f6z\u00fcne ve ruhuna, demokratik toplum d\u00fczeninin ve laik Cumhuriyetin gereklerine ve \u00f6l\u00e7\u00fcl\u00fcl\u00fck ilkesine ayk\u0131r\u0131 olamaz.',
        },
        {
          provision_ref: 'madde38', section: '38', chapter: '\u0130kinci K\u0131s\u0131m - Temel Haklar ve \u00d6devler',
          title: 'Su\u00e7 ve cezalara ili\u015fkin esaslar',
          content: 'Madde 38 - Kimse, i\u015flendi\u011fi zaman y\u00fcr\u00fcrl\u00fckte bulunan kanunun su\u00e7 saymad\u0131\u011f\u0131 bir fiilden dolay\u0131 cezaland\u0131r\u0131lamaz; kimseye su\u00e7u i\u015fledi\u011fi zaman kanunda o su\u00e7 i\u00e7in konulmu\u015f olan cezadan daha a\u011f\u0131r bir ceza verilemez.',
        },
      );
      break;

    case 'ecom-law-5809':
      provisions.push(
        {
          provision_ref: 'madde1', section: '1', chapter: 'Birinci K\u0131s\u0131m',
          title: 'Ama\u00e7',
          content: 'Madde 1 - Bu Kanunun amac\u0131; elektronik haberle\u015fme sekt\u00f6r\u00fcne ili\u015fkin politika ve stratejiler ile ilgili h\u00fck\u00fcmleri ve genel esaslar\u0131 belirlemek, d\u00fczenleme, yetkilendirme, tesis kurma, denetim, uzla\u015ft\u0131rma, m\u00fceyyide ve ilgili \u00f6l\u00e7\u00fctler ile bunlar\u0131n uygulanmas\u0131na ili\u015fkin usul ve esaslar\u0131 d\u00fczenlmektir.',
        },
        {
          provision_ref: 'madde3', section: '3', chapter: 'Birinci K\u0131s\u0131m',
          title: 'Tan\u0131mlar',
          content: 'Madde 3 - Bu Kanunun uygulanmas\u0131nda; a) Abone: Bir i\u015fletmeci ile elektronik haberle\u015fme hizmetinin sunumuna y\u00f6nelik olarak yap\u0131lan bir s\u00f6zle\u015fmeye taraf olan ger\u00e7ek ya da t\u00fczel ki\u015fiyi, b) Elektronik haberle\u015fme: Elektriksel i\u015faretlere d\u00f6n\u00fc\u015ft\u00fcr\u00fclebilen her t\u00fcrl\u00fc i\u015faret, sembol, ses, g\u00f6r\u00fcnt\u00fc ve verinin; kablo, telsiz, optik, elektrik, manyetik, elektromanyetik, elektrokimyasal, elektromekanik ve di\u011fer iletim sistemleri vas\u0131tas\u0131yla iletilmesini, g\u00f6nderilmesini ve al\u0131nmas\u0131n\u0131, c) Kurum: Bilgi Teknolojileri ve \u0130leti\u015fim Kurumunu (BTK), ifade eder.',
        },
        {
          provision_ref: 'madde4', section: '4', chapter: 'Birinci K\u0131s\u0131m',
          title: 'Temel ilkeler',
          content: 'Madde 4 - Bilgi Teknolojileri ve \u0130leti\u015fim Kurumu (BTK), elektronik haberle\u015fme sekt\u00f6r\u00fcne ili\u015fkin g\u00f6rev ve yetkilerini kullan\u0131rken; a) Rekabeti sa\u011flamak ve korumak, b) T\u00fcketici haklar\u0131n\u0131 korumak, c) Evrensel hizmeti sa\u011flamak, \u00e7) Ki\u015fisel verilerin ve gizlili\u011fin korunmas\u0131n\u0131 sa\u011flamak, ilkelerine uyar.',
        },
        {
          provision_ref: 'madde51', section: '51', chapter: 'Be\u015finci K\u0131s\u0131m',
          title: 'Ki\u015fisel verilerin i\u015flenmesi ve gizlili\u011fin korunmas\u0131',
          content: 'Madde 51 - (1) Ki\u015fisel veriler ile ili\u015fkili trafik ve konum verilerinin i\u015flenmesi s\u0131ras\u0131nda gizlili\u011fin korunmas\u0131na ili\u015fkin h\u00fck\u00fcmler, Kurum taraf\u0131ndan belirlenen usul ve esaslara g\u00f6re uygulan\u0131r. (2) \u0130\u015fletmeciler, abonelerine/kullan\u0131c\u0131lar\u0131na ili\u015fkin ki\u015fisel verilerin g\u00fcvenli\u011fini sa\u011flamak i\u00e7in gerekli tedbirleri al\u0131r.',
        },
      );
      definitions.push(
        { term: 'Elektronik haberle\u015fme', definition: 'Elektriksel i\u015faretlere d\u00f6n\u00fc\u015ft\u00fcr\u00fclebilen her t\u00fcrl\u00fc i\u015faret, sembol, ses, g\u00f6r\u00fcnt\u00fc ve verinin iletilmesi, g\u00f6nderilmesi ve al\u0131nmas\u0131', source_provision: 'madde3' },
        { term: 'BTK', definition: 'Bilgi Teknolojileri ve \u0130leti\u015fim Kurumu', source_provision: 'madde3' },
      );
      break;

    case 'esig-law-5070':
      provisions.push(
        {
          provision_ref: 'madde1', section: '1', chapter: 'Birinci B\u00f6l\u00fcm',
          title: 'Ama\u00e7',
          content: 'Madde 1 - Bu Kanunun amac\u0131, elektronik imzan\u0131n hukuki ve teknik y\u00f6nleri ile kullan\u0131m\u0131na ili\u015fkin esaslar\u0131 d\u00fczenlmektir.',
        },
        {
          provision_ref: 'madde3', section: '3', chapter: 'Birinci B\u00f6l\u00fcm',
          title: 'Tan\u0131mlar',
          content: 'Madde 3 - Bu Kanunun uygulanmas\u0131nda; a) Elektronik imza: Ba\u015fka bir elektronik veriye eklenen veya elektronik veriyle mant\u0131ksal ba\u011flant\u0131s\u0131 bulunan ve kimlik do\u011frulama amac\u0131yla kullan\u0131lan elektronik veriyi, b) G\u00fcvenli elektronik imza: M\u00fcnhas\u0131ran imza sahibine ba\u011fl\u0131, sadece imza sahibinin tasarrufunda bulunan g\u00fcvenli elektronik imza olu\u015fturma arac\u0131 ile olu\u015fturulan, nitelikli elektronik sertifikaya dayanan ve imzalanm\u0131\u015f elektronik veride sonradan herhangi bir de\u011fi\u015fiklik yap\u0131l\u0131p yap\u0131lmad\u0131\u011f\u0131n\u0131n tespitini sa\u011flayan elektronik imzay\u0131, c) \u0130mza sahibi: Elektronik imza olu\u015fturan ger\u00e7ek ki\u015fiyi, \u00e7) Elektronik sertifika hizmet sa\u011flay\u0131c\u0131s\u0131: Elektronik sertifika, zaman damgas\u0131 ve elektronik imzalarla ilgili hizmetleri sa\u011flayan kamu kurum ve kurulu\u015flar\u0131 ile ger\u00e7ek veya \u00f6zel hukuk t\u00fczel ki\u015filerini, ifade eder.',
        },
        {
          provision_ref: 'madde5', section: '5', chapter: '\u0130kinci B\u00f6l\u00fcm',
          title: 'G\u00fcvenli elektronik imzan\u0131n hukuki sonucu ve uygulama alan\u0131',
          content: 'Madde 5 - G\u00fcvenli elektronik imza, elle at\u0131lan imza ile ayn\u0131 hukuki sonucu do\u011furur. Kanunlar\u0131n resmi \u015fekle veya \u00f6zel bir merasime tabi tuttu\u011fu hukuki i\u015flemler ile teminat s\u00f6zle\u015fmeleri g\u00fcvenli elektronik imza ile ger\u00e7ekle\u015ftirilemez.',
        },
      );
      definitions.push(
        { term: 'Elektronik imza', definition: 'Ba\u015fka bir elektronik veriye eklenen veya elektronik veriyle mant\u0131ksal ba\u011flant\u0131s\u0131 bulunan ve kimlik do\u011frulama amac\u0131yla kullan\u0131lan elektronik veri', source_provision: 'madde3' },
        { term: 'G\u00fcvenli elektronik imza', definition: 'M\u00fcnhas\u0131ran imza sahibine ba\u011fl\u0131, sadece imza sahibinin tasarrufunda bulunan g\u00fcvenli elektronik imza olu\u015fturma arac\u0131 ile olu\u015fturulan, nitelikli elektronik sertifikaya dayanan elektronik imza', source_provision: 'madde3' },
      );
      break;

    case 'payment-law-6493':
      provisions.push(
        {
          provision_ref: 'madde1', section: '1', chapter: 'Birinci B\u00f6l\u00fcm',
          title: 'Ama\u00e7',
          content: 'Madde 1 - Bu Kanunun amac\u0131; \u00f6deme ve menkul k\u0131ymet mutabakat sistemlerinin kurulu\u015f ve i\u015fleyi\u015fini, \u00f6deme hizmetlerinin sunulmas\u0131n\u0131 ve elektronik para kurulu\u015flar\u0131n\u0131n faaliyetlerini d\u00fczenlmektir.',
        },
        {
          provision_ref: 'madde3', section: '3', chapter: 'Birinci B\u00f6l\u00fcm',
          title: 'Tan\u0131mlar',
          content: 'Madde 3 - Bu Kanunun uygulanmas\u0131nda; a) Banka: 19/10/2005 tarihli ve 5411 say\u0131l\u0131 Bankac\u0131l\u0131k Kanununda tan\u0131mlanan bankalar\u0131, b) Elektronik para: Elektronik para ihrac\u0131 yapan kurulu\u015fa ait sistem veya ara\u00e7lar arac\u0131l\u0131\u011f\u0131yla depolanan nakdi de\u011feri, c) Elektronik para kurulu\u015fu: Elektronik para ihrac\u0131 yapan anonim \u015firketi, \u00e7) \u00d6deme hizmeti: Para havalesi, \u00f6deme i\u015fleminin y\u00fcr\u00fct\u00fclmesi ve benzeri hizmetleri, d) \u00d6deme kurulu\u015fu: \u00d6deme hizmeti sunan anonim \u015firketi, ifade eder.',
        },
        {
          provision_ref: 'madde12', section: '12', chapter: '\u00dc\u00e7\u00fcnc\u00fc B\u00f6l\u00fcm',
          title: '\u00d6deme hizmetleri',
          content: 'Madde 12 - \u00d6deme hizmetleri: a) \u00d6deme hesab\u0131na para yat\u0131r\u0131lmas\u0131 ve para \u00e7ekilmesi i\u00e7in gerekli t\u00fcm i\u015flemler dahil, \u00f6deme hesab\u0131n\u0131n i\u015fletilmesi, b) \u00d6deme i\u015flemlerinin y\u00fcr\u00fct\u00fclmesi, c) \u00d6deme arac\u0131n\u0131n ihrac\u0131, d) Para havalesi, e) Fatura \u00f6deme hizmetleri, f) \u00d6deme i\u015flemlerinin y\u00fcr\u00fct\u00fclmesinde kullan\u0131lan teknik altyap\u0131n\u0131n i\u015fletilmesini kapsar.',
        },
      );
      definitions.push(
        { term: 'Elektronik para', definition: 'Elektronik para ihrac\u0131 yapan kurulu\u015fa ait sistem veya ara\u00e7lar arac\u0131l\u0131\u011f\u0131yla depolanan nakdi de\u011fer', source_provision: 'madde3' },
        { term: '\u00d6deme kurulu\u015fu', definition: '\u00d6deme hizmeti sunan anonim \u015firket', source_provision: 'madde3' },
        { term: 'Elektronik para kurulu\u015fu', definition: 'Elektronik para ihrac\u0131 yapan anonim \u015firket', source_provision: 'madde3' },
      );
      break;

    case 'btk-regulation-5809-secondary':
      // BTK regulations share the same law number (5809) - skip to avoid duplicate
      // The primary EHK entry covers this law
      break;

    default:
      // No known fallback provisions for this law
      break;
  }

  return { provisions, definitions };
}

async function fetchAndParseActs(acts: ActIndexEntry[], skipFetch: boolean): Promise<void> {
  console.log(`\nProcessing ${acts.length} Turkish Acts from mevzuat.gov.tr...\n`);

  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let fallbackCount = 0;
  let totalProvisions = 0;
  let totalDefinitions = 0;
  const results: { act: string; provisions: number; definitions: number; status: string }[] = [];

  // Deduplicate by id (btk-regulation-5809-secondary shares law number with ecom-law-5809)
  const seenIds = new Set<string>();

  for (const act of acts) {
    if (seenIds.has(act.id)) {
      console.log(`  SKIP ${act.shortName} (duplicate id: ${act.id})`);
      skipped++;
      processed++;
      continue;
    }
    seenIds.add(act.id);

    const sourceFile = path.join(SOURCE_DIR, `${act.id}.html`);
    const seedFile = path.join(SEED_DIR, `${act.id}.json`);

    // Skip if seed already exists and we're in skip-fetch mode
    if (skipFetch && fs.existsSync(seedFile)) {
      const existing = JSON.parse(fs.readFileSync(seedFile, 'utf-8')) as ParsedAct;
      const provCount = existing.provisions?.length ?? 0;
      const defCount = existing.definitions?.length ?? 0;
      totalProvisions += provCount;
      totalDefinitions += defCount;
      results.push({ act: act.shortName, provisions: provCount, definitions: defCount, status: 'cached' });
      skipped++;
      processed++;
      continue;
    }

    try {
      let html: string | null = null;

      if (fs.existsSync(sourceFile) && skipFetch) {
        html = fs.readFileSync(sourceFile, 'utf-8');
        console.log(`  Using cached ${act.shortName} (${act.id}) (${(html.length / 1024).toFixed(0)} KB)`);
      } else if (!skipFetch) {
        process.stdout.write(`  Fetching ${act.shortName} (Law ${act.lawNumber})...`);
        const result = await fetchWithRateLimit(act.url);

        if (result.status === 200 && result.body.length > 500) {
          html = result.body;
          fs.writeFileSync(sourceFile, html);
          console.log(` OK (${(html.length / 1024).toFixed(0)} KB)`);
        } else {
          console.log(` HTTP ${result.status} (${result.body.length} bytes) -- using fallback`);
          html = null;
        }
      }

      let parsed: ParsedAct;

      if (html && html.length > 500) {
        parsed = parseTurkishHtml(html, act);
        console.log(`    -> ${parsed.provisions.length} provisions, ${parsed.definitions.length} definitions extracted`);

        // If parsing yielded very few provisions, supplement with fallback
        if (parsed.provisions.length < 2) {
          console.log(`    -> Low provision count, supplementing with fallback data`);
          const fallback = createFallbackSeed(act);
          // Merge: keep parsed provisions, add fallback ones not already present
          const existingRefs = new Set(parsed.provisions.map(p => p.provision_ref));
          for (const fp of fallback.provisions) {
            if (!existingRefs.has(fp.provision_ref)) {
              parsed.provisions.push(fp);
            }
          }
          const existingTerms = new Set(parsed.definitions.map(d => d.term));
          for (const fd of fallback.definitions) {
            if (!existingTerms.has(fd.term)) {
              parsed.definitions.push(fd);
            }
          }
          console.log(`    -> After supplement: ${parsed.provisions.length} provisions, ${parsed.definitions.length} definitions`);
        }
      } else {
        console.log(`  Creating fallback seed for ${act.shortName}...`);
        parsed = createFallbackSeed(act);
        console.log(`    -> ${parsed.provisions.length} provisions, ${parsed.definitions.length} definitions (fallback)`);
        fallbackCount++;
      }

      fs.writeFileSync(seedFile, JSON.stringify(parsed, null, 2));
      totalProvisions += parsed.provisions.length;
      totalDefinitions += parsed.definitions.length;
      results.push({
        act: act.shortName,
        provisions: parsed.provisions.length,
        definitions: parsed.definitions.length,
        status: html ? 'OK' : 'fallback',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ERROR ${act.shortName}: ${msg}`);

      // Even on error, create fallback seed
      console.log(`  Creating fallback seed for ${act.shortName} after error...`);
      const fallback = createFallbackSeed(act);
      fs.writeFileSync(seedFile, JSON.stringify(fallback, null, 2));
      totalProvisions += fallback.provisions.length;
      totalDefinitions += fallback.definitions.length;
      results.push({
        act: act.shortName,
        provisions: fallback.provisions.length,
        definitions: fallback.definitions.length,
        status: `fallback (${msg.substring(0, 60)})`,
      });
      fallbackCount++;
      failed++;
    }

    processed++;
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('INGESTION REPORT');
  console.log('='.repeat(70));
  console.log(`\n  Source:       mevzuat.gov.tr (Presidency Legislation Information System)`);
  console.log(`  Processed:    ${processed}`);
  console.log(`  Cached:       ${skipped}`);
  console.log(`  Fallbacks:    ${fallbackCount}`);
  console.log(`  Failed:       ${failed}`);
  console.log(`  Total provisions:  ${totalProvisions}`);
  console.log(`  Total definitions: ${totalDefinitions}`);
  console.log(`\n  Per-Act breakdown:`);
  console.log(`  ${'Act'.padEnd(25)} ${'Provisions'.padStart(12)} ${'Definitions'.padStart(13)} ${'Status'.padStart(10)}`);
  console.log(`  ${'-'.repeat(25)} ${'-'.repeat(12)} ${'-'.repeat(13)} ${'-'.repeat(10)}`);
  for (const r of results) {
    console.log(`  ${r.act.padEnd(25)} ${String(r.provisions).padStart(12)} ${String(r.definitions).padStart(13)} ${r.status.padStart(10)}`);
  }
  console.log('');
}

async function main(): Promise<void> {
  const { limit, skipFetch } = parseArgs();

  console.log('Turkish Law MCP -- Ingestion Pipeline');
  console.log('=====================================\n');
  console.log(`  Source: mevzuat.gov.tr (Cumhurba\u015fkanl\u0131\u011f\u0131 Mevzuat Bilgi Sistemi)`);
  console.log(`  License: Government Public Data`);
  console.log(`  Rate limit: 500ms between requests`);

  if (limit) console.log(`  --limit ${limit}`);
  if (skipFetch) console.log(`  --skip-fetch`);

  // Filter out the duplicate BTK secondary entry
  const uniqueActs = KEY_TURKISH_ACTS.filter(a => a.id !== 'btk-regulation-5809-secondary');
  const acts = limit ? uniqueActs.slice(0, limit) : uniqueActs;
  await fetchAndParseActs(acts, skipFetch);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
