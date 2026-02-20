/**
 * Rate-limited HTTP client for mevzuat.gov.tr (Turkish Legislation Information System)
 *
 * mevzuat.gov.tr is the official legislation database operated by the Presidency
 * of the Republic of Turkey. It serves consolidated legislation as HTML pages.
 *
 * URL patterns:
 *   HTML: https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=XXXX&MevzuatTur=1&MevzuatTertip=5
 *   PDF:  https://www.mevzuat.gov.tr/mevzuatmetin/1.5.XXXX.pdf
 *
 * - 500ms minimum delay between requests (be respectful to government servers)
 * - User-Agent header identifying the MCP
 * - No auth needed (Government Public Data)
 */

const USER_AGENT = 'Turkish-Law-MCP/1.0 (https://github.com/Ansvar-Systems/turkish-law-mcp; hello@ansvar.ai)';
const MIN_DELAY_MS = 500;

let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
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
}

/**
 * Fetch a Turkish legislation page from mevzuat.gov.tr.
 *
 * Uses the HTML endpoint which provides structured legislation content:
 *   https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=XXXX&MevzuatTur=1&MevzuatTertip=5
 *
 * MevzuatTur=1 = Kanun (Law)
 * MevzuatTertip=5 = Fifth Tertip (current legislation period)
 */
export async function fetchMevzuatPage(lawNumber: number): Promise<FetchResult> {
  const url = `https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=${lawNumber}&MevzuatTur=1&MevzuatTertip=5`;
  return fetchWithRateLimit(url);
}
