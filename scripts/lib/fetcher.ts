/**
 * Rate-limited HTTP client for mevzuat.gov.tr (Turkish Legislation Information System)
 *
 * mevzuat.gov.tr is the official legislation database operated by the Presidency
 * of the Republic of Turkey. It serves consolidated legislation as HTML pages.
 *
 * URL patterns:
 *   Iframe content: https://www.mevzuat.gov.tr/anasayfa/MevzuatFihristDetayIframe?MevzuatTur=X&MevzuatNo=YYYY&MevzuatTertip=5
 *   Main page:      https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=XXXX&MevzuatTur=1&MevzuatTertip=5
 *   PDF:            https://www.mevzuat.gov.tr/mevzuatmetin/1.5.XXXX.pdf
 *
 * - 500ms minimum delay between requests (be respectful to government servers)
 * - Max 3 concurrent requests
 * - User-Agent header identifying the MCP
 * - No auth needed (Government Public Data)
 */

const USER_AGENT = 'Turkish-Law-MCP/2.0 (https://github.com/Ansvar-Systems/turkish-law-mcp; hello@ansvar.ai)';
const MIN_DELAY_MS = 500;
const MAX_CONCURRENT = 3;

let lastRequestTime = 0;
let activeRequests = 0;

async function rateLimit(): Promise<void> {
  // Wait for concurrency slot
  while (activeRequests >= MAX_CONCURRENT) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
  activeRequests++;
}

function releaseSlot(): void {
  activeRequests = Math.max(0, activeRequests - 1);
}

export interface FetchResult {
  status: number;
  body: string;
  contentType: string;
  url: string;
}

/**
 * Fetch a URL with rate limiting and proper headers.
 * Retries up to 3 times on 429/5xx errors with exponential backoff.
 */
export async function fetchWithRateLimit(url: string, maxRetries = 3): Promise<FetchResult> {
  await rateLimit();

  try {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html, application/xhtml+xml, */*',
            'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.5',
          },
          redirect: 'follow',
        });

        if (response.status === 429 || response.status >= 500) {
          if (attempt < maxRetries) {
            const backoff = Math.pow(2, attempt + 1) * 1000;
            console.log(`  HTTP ${response.status} for ${url}, retrying in ${backoff}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoff));
            continue;
          }
        }

        const body = await response.text();
        return {
          status: response.status,
          body,
          contentType: response.headers.get('content-type') ?? '',
          url: response.url,
        };
      } catch (err) {
        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt + 1) * 1000;
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`  Network error for ${url}: ${msg}, retrying in ${backoff}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }
        throw err;
      }
    }

    throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
  } finally {
    releaseSlot();
  }
}

/**
 * Fetch Turkish legislation content from mevzuat.gov.tr.
 *
 * Uses the iframe content endpoint which returns the actual legislation HTML,
 * not the outer page shell:
 *   https://www.mevzuat.gov.tr/anasayfa/MevzuatFihristDetayIframe?MevzuatTur=X&MevzuatNo=YYYY&MevzuatTertip=5
 *
 * MevzuatTur values:
 *   1  = Kanun (Law)
 *   4  = KHK (Decree Law)
 *   19 = Cumhurbaşkanlığı Kararnamesi (Presidential Decree)
 *
 * MevzuatTertip=5 = Fifth Tertip (current legislation period)
 */
export async function fetchMevzuatContent(
  mevzuatNo: string,
  mevzuatTur: number = 1,
  mevzuatTertip: number = 5,
): Promise<FetchResult> {
  const url = `https://www.mevzuat.gov.tr/anasayfa/MevzuatFihristDetayIframe?MevzuatTur=${mevzuatTur}&MevzuatNo=${mevzuatNo}&MevzuatTertip=${mevzuatTertip}`;
  return fetchWithRateLimit(url);
}

/**
 * @deprecated Use fetchMevzuatContent instead. Kept for backward compatibility.
 */
export async function fetchMevzuatPage(lawNumber: number): Promise<FetchResult> {
  return fetchMevzuatContent(String(lawNumber), 1, 5);
}
