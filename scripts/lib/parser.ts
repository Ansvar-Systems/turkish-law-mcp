/**
 * HTML parser for Turkish legislation from mevzuat.gov.tr
 *
 * mevzuat.gov.tr serves legislation as server-rendered HTML via an iframe
 * endpoint. The content is Word-exported HTML with articles ("Madde") as the
 * primary structural unit.
 *
 * Turkish legislation structure:
 *   - "KISIM" or "BÖLÜM" = Part/Chapter headings
 *   - "Madde X" = Article X (provision_ref: "maddeX")
 *   - "Geçici Madde X" = Transitional Article X (provision_ref: "gecici_maddeX")
 *   - "Ek Madde X" = Additional Article X (provision_ref: "ek_maddeX")
 *   - Definitions are typically in Madde 2 or Madde 3 ("Tanımlar")
 *
 * The iframe HTML is exported from Microsoft Word, containing deeply nested
 * tables and styled spans. Content must be stripped to plain text for parsing.
 */

export interface ActIndexEntry {
  id: string;
  mevzuatNo: string;
  mevzuatTur: number;
  mevzuatTertip: number;
  title: string;
  titleEn?: string;
  shortName?: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  gazetteDate: string;
  gazetteNumber: string;
  acceptanceDate: string;
  url: string;
  description?: string;
  /** Optional: only ingest specific article ranges (e.g., TCK arts. 243-246) */
  articleFilter?: { from: number; to: number };
}

export interface ParsedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title: string;
  content: string;
}

export interface ParsedDefinition {
  term: string;
  definition: string;
  source_provision?: string;
}

export interface ParsedAct {
  id: string;
  type: 'statute';
  title: string;
  title_en: string;
  short_name: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date: string;
  in_force_date: string;
  url: string;
  description?: string;
  provisions: ParsedProvision[];
  definitions: ParsedDefinition[];
}

/**
 * Strip HTML tags and decode common entities, normalising whitespace.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#xA0;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ouml;/g, '\u00f6')
    .replace(/&uuml;/g, '\u00fc')
    .replace(/&ccedil;/g, '\u00e7')
    .replace(/&Ouml;/g, '\u00d6')
    .replace(/&Uuml;/g, '\u00dc')
    .replace(/&Ccedil;/g, '\u00c7')
    .replace(/&#246;/g, '\u00f6')
    .replace(/&#252;/g, '\u00fc')
    .replace(/&#231;/g, '\u00e7')
    .replace(/&#214;/g, '\u00d6')
    .replace(/&#220;/g, '\u00dc')
    .replace(/&#199;/g, '\u00c7')
    .replace(/&#304;/g, '\u0130') // İ
    .replace(/&#305;/g, '\u0131') // ı
    .replace(/&#350;/g, '\u015e') // Ş
    .replace(/&#351;/g, '\u015f') // ş
    .replace(/&#286;/g, '\u011e') // Ğ
    .replace(/&#287;/g, '\u011f') // ğ
    .replace(/\u200B/g, '')       // zero-width space
    .replace(/\u00AD/g, '')       // soft hyphen
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .replace(/^\s+|\s+$/gm, '')
    .trim();
}

/**
 * Extract the current chapter/part heading from text preceding an article.
 * Looks for patterns like:
 *   "BİRİNCİ KISIM" / "İKİNCİ BÖLÜM" / "ÜÇÜNCÜ BÖLÜM"
 *   or "KISIM I" / "BÖLÜM II" etc.
 */
function extractChapterHeading(textBefore: string): string | undefined {
  const patterns = [
    // "BİRİNCİ KISIM - Title" or "BİRİNCİ BÖLÜM - Title"
    /(\b(?:B[Ii\u0130\u0131][Rr][Ii\u0130\u0131][Nn][Cc][Ii\u0130\u0131]|[Ii\u0130\u0131][Kk][Ii\u0130\u0131][Nn][Cc][Ii\u0130\u0131]|[Uu\u00dc\u00fc][Cc\u00c7\u00e7][Uu\u00dc\u00fc][Nn][Cc][Uu\u00dc\u00fc]|[Dd][Oo\u00d6\u00f6][Rr][Dd][Uu\u00dc\u00fc][Nn][Cc][Uu\u00dc\u00fc]|[Bb][Ee\u015e\u015f][Ii\u0130\u0131][Nn][Cc][Ii\u0130\u0131]|[Aa][Ll][Tt][Ii\u0130\u0131][Nn][Cc][Ii\u0130\u0131]|[Yy][Ee][Dd][Ii\u0130\u0131][Nn][Cc][Ii\u0130\u0131]|[Ss][Ee][Kk][Ii\u0130\u0131][Zz][Ii\u0130\u0131][Nn][Cc][Ii\u0130\u0131]|[Dd][Oo\u00d6\u00f6][Kk][Uu\u00dc\u00fc][Zz][Uu\u00dc\u00fc][Nn][Cc][Uu\u00dc\u00fc]|[Oo][Nn][Uu\u00dc\u00fc][Nn][Cc][Uu\u00dc\u00fc])\s+(?:K[Ii\u0130\u0131]S[Ii\u0130\u0131]M|B[Oo\u00d6\u00f6]L[Uu\u00dc\u00fc]M))\b/i,
    // Simple "BÖLÜM N" or "KISIM N"
    /\b((?:K[Ii\u0130\u0131]S[Ii\u0130\u0131]M|B[Oo\u00d6\u00f6]L[Uu\u00dc\u00fc]M)\s+[IVX\d]+)\b/i,
  ];

  const lines = textBefore.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        return line.substring(0, 120).trim();
      }
    }
  }

  return undefined;
}

/**
 * Parse mevzuat.gov.tr HTML to extract provisions from a statute page.
 *
 * Turkish legislation uses "Madde N" (Article N) as the primary structural unit.
 * Articles are identified by patterns like "Madde 1 -" in the text.
 *
 * The parser splits the HTML content on article boundaries and extracts
 * each article's number, title (if present after the dash), and full text.
 */
export function parseTurkishHtml(html: string, act: ActIndexEntry): ParsedAct {
  const provisions: ParsedProvision[] = [];
  const definitions: ParsedDefinition[] = [];

  // Strip HTML to get clean text for article extraction
  const cleanText = stripHtml(html);

  // Split on "Madde N" boundaries
  // Pattern matches: "Madde 1 -" or "Madde 1-" or "MADDE 1 -" or "Madde 10/A -"
  // No word boundary (\b) is used because HTML stripping can collapse whitespace,
  // causing "TanımlarMADDE 3-" patterns that \b would miss.
  const articlePattern = /((?:MADDE|Madde)\s+(\d+(?:\/[A-Za-z])?)\s*[\-\u2013\u2014])/gi;

  const articleStarts: { fullMatch: string; articleNum: string; index: number; type: 'regular' | 'gecici' | 'ek' }[] = [];
  let match: RegExpExecArray | null;

  while ((match = articlePattern.exec(cleanText)) !== null) {
    articleStarts.push({
      fullMatch: match[1],
      articleNum: match[2],
      index: match.index,
      type: 'regular',
    });
  }

  // Also find transitional articles: "Geçici Madde N"
  const geciciPattern = /(Ge[c\u00e7]ici\s+Madde\s+(\d+)\s*[\-\u2013\u2014])/gi;
  while ((match = geciciPattern.exec(cleanText)) !== null) {
    articleStarts.push({
      fullMatch: match[1],
      articleNum: match[2],
      index: match.index,
      type: 'gecici',
    });
  }

  // Also find additional articles: "Ek Madde N"
  const ekPattern = /(Ek\s+Madde\s+(\d+)\s*[\-\u2013\u2014])/gi;
  while ((match = ekPattern.exec(cleanText)) !== null) {
    articleStarts.push({
      fullMatch: match[1],
      articleNum: match[2],
      index: match.index,
      type: 'ek',
    });
  }

  // Sort all articles by their position in the text
  articleStarts.sort((a, b) => a.index - b.index);

  // Deduplicate: if the same article appears at close proximity, keep first
  const deduped: typeof articleStarts = [];
  for (const art of articleStarts) {
    const last = deduped[deduped.length - 1];
    if (last && Math.abs(last.index - art.index) < 20 && last.articleNum === art.articleNum && last.type === art.type) {
      continue;
    }
    deduped.push(art);
  }

  let currentChapter: string | undefined;

  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i];
    const endIndex = i + 1 < deduped.length
      ? deduped[i + 1].index
      : cleanText.length;

    const articleNum = start.articleNum;
    const numericPart = parseInt(articleNum, 10);

    // Apply article filter if specified (e.g., TCK only arts. 243-246)
    if (act.articleFilter && start.type === 'regular') {
      if (numericPart < act.articleFilter.from || numericPart > act.articleFilter.to) {
        continue;
      }
    }

    const articleText = cleanText.substring(start.index + start.fullMatch.length, endIndex).trim();

    // Extract title: text before the first sentence (before first period or newline)
    const titleEndMatch = articleText.match(/^([^\n.]+)/);
    const rawTitle = titleEndMatch ? titleEndMatch[1].trim() : '';
    // Clean the title - remove leading parenthetical amendment notes like "(1)"
    const title = rawTitle.replace(/^\(\d+\)\s*/, '').substring(0, 200);

    let provisionRef: string;
    let section: string;
    let chapter: string | undefined;
    let contentPrefix: string;

    if (start.type === 'gecici') {
      provisionRef = `gecici_madde${articleNum}`;
      section = `G${articleNum}`;
      chapter = 'Ge\u00e7ici Maddeler';
      contentPrefix = `Ge\u00e7ici Madde ${articleNum} - `;
    } else if (start.type === 'ek') {
      provisionRef = `ek_madde${articleNum}`;
      section = `E${articleNum}`;
      chapter = 'Ek Maddeler';
      contentPrefix = `Ek Madde ${articleNum} - `;
    } else {
      provisionRef = `madde${articleNum.replace('/', '_')}`;
      section = articleNum;
      contentPrefix = `Madde ${articleNum} - `;

      // Try to determine chapter from text before this article
      const textBefore = cleanText.substring(
        Math.max(0, start.index - 500),
        start.index,
      );
      const chapterCandidate = extractChapterHeading(textBefore);
      if (chapterCandidate) {
        currentChapter = chapterCandidate;
      }
      chapter = currentChapter;
    }

    const content = (contentPrefix + articleText).substring(0, 12000);

    if (content.length > 20) {
      provisions.push({
        provision_ref: provisionRef,
        chapter,
        section,
        title,
        content,
      });
    }

    // Extract definitions from "Tanımlar" (Definitions) article.
    // Check both the title and the content for definition patterns since
    // the "Tanımlar" heading may appear in the text preceding the article
    // and not in the extracted title.
    if (start.type === 'regular') {
      const combinedText = (title + ' ' + articleText).toLowerCase();
      const isDefinitionArticle =
        combinedText.includes('tan\u0131m') ||
        combinedText.includes('tanim') ||
        combinedText.includes('kavram');
      // Also detect articles that look like definitions by having many "X: ..." patterns
      const colonCount = (articleText.match(/\)\s*[^:]+:/g) || []).length;
      if (isDefinitionArticle || colonCount >= 3) {
        extractDefinitions(articleText, provisionRef, definitions);
      }
    }
  }

  return {
    id: act.id,
    type: 'statute',
    title: act.title,
    title_en: act.titleEn ?? '',
    short_name: act.shortName ?? act.mevzuatNo,
    status: act.status,
    issued_date: act.gazetteDate || act.acceptanceDate,
    in_force_date: act.gazetteDate,
    url: act.url,
    description: act.description,
    provisions,
    definitions,
  };
}

/**
 * Extract term definitions from a "Tanımlar" (Definitions) article.
 *
 * Turkish definition patterns:
 *   "a) Kanun: ..."
 *   "a) Kişisel veri: ..."
 *   "1) İlgili kişi: ..."
 *   or numbered patterns with Turkish letters
 */
function extractDefinitions(
  articleText: string,
  sourceProvision: string,
  definitions: ParsedDefinition[],
): void {
  // Pattern: letter/number followed by closing paren, then term, then colon, then definition
  // After HTML stripping, content may be on a single line, so we match anywhere (not just ^/\n).
  // The delimiter between definitions is typically a comma followed by the next letter/number)
  const defPattern = /(?:[a-z\u00e7\u011f\u0131\u00f6\u015f\u00fc]|\d+)\)\s*([^:]{2,80}):\s*([^,;]+(?:[,;][^,;]*)?)/gi;

  let defMatch: RegExpExecArray | null;
  while ((defMatch = defPattern.exec(articleText)) !== null) {
    const term = defMatch[1].trim();
    let definition = defMatch[2].trim();

    // Clean trailing comma or semicolon from the definition
    definition = definition.replace(/[,;]\s*$/, '').trim();

    if (term.length > 1 && term.length < 100 && definition.length > 5) {
      definitions.push({
        term,
        definition: definition.substring(0, 4000),
        source_provision: sourceProvision,
      });
    }
  }
}

/**
 * Pre-configured list of key Turkish Acts (seed data fallback).
 * Used only when census.json is not available.
 */
export const KEY_TURKISH_ACTS: ActIndexEntry[] = [
  {
    id: 'kanun-6698',
    mevzuatNo: '6698',
    mevzuatTur: 1,
    mevzuatTertip: 5,
    title: 'Ki\u015fisel Verilerin Korunmas\u0131 Kanunu',
    titleEn: 'Personal Data Protection Law (KVKK)',
    shortName: 'KVKK',
    status: 'in_force',
    gazetteDate: '2016-04-07',
    gazetteNumber: '29677',
    acceptanceDate: '2016-03-24',
    url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6698&MevzuatTur=1&MevzuatTertip=5',
    description: 'Turkey\'s comprehensive data protection law',
  },
  {
    id: 'kanun-5651',
    mevzuatNo: '5651',
    mevzuatTur: 1,
    mevzuatTertip: 5,
    title: '\u0130nternet Ortam\u0131nda Yap\u0131lan Yay\u0131nlar\u0131n D\u00fczenlenmesi ve Bu Yay\u0131nlar Yoluyla \u0130\u015flenen Su\u00e7larla M\u00fccadele Edilmesi Hakk\u0131nda Kanun',
    titleEn: 'Internet Regulation Law',
    shortName: 'Law 5651',
    status: 'in_force',
    gazetteDate: '2007-05-23',
    gazetteNumber: '26530',
    acceptanceDate: '2007-05-04',
    url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=5651&MevzuatTur=1&MevzuatTertip=5',
    description: 'Turkey\'s primary internet regulation law',
  },
  {
    id: 'kanun-2709',
    mevzuatNo: '2709',
    mevzuatTur: 1,
    mevzuatTertip: 5,
    title: 'T\u00fcrkiye Cumhuriyeti Anayasas\u0131',
    titleEn: 'Constitution of the Republic of Turkey',
    shortName: 'Anayasa',
    status: 'in_force',
    gazetteDate: '1982-11-09',
    gazetteNumber: '17863',
    acceptanceDate: '1982-11-07',
    url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=2709&MevzuatTur=1&MevzuatTertip=5',
    description: 'Supreme law of Turkey',
  },
];
