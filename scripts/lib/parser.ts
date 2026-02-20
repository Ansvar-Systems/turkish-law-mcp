/**
 * HTML parser for Turkish legislation from mevzuat.gov.tr
 *
 * mevzuat.gov.tr serves legislation as server-rendered HTML. The content
 * uses a structured format with articles ("Madde") as the primary unit.
 *
 * Turkish legislation structure:
 *   - "KISIM" or "BOLUM" = Part/Chapter headings
 *   - "Madde X" = Article X (provision_ref: "maddeX")
 *   - "Gecici Madde X" = Transitional Article X (provision_ref: "gecici_maddeX")
 *   - Definitions are typically in Madde 2 ("Tanimlar" = Definitions)
 *
 * The HTML contains article blocks that can be identified by patterns like:
 *   "Madde 1 -" or "Madde 1-" or "MADDE 1-"
 *   "Gecici Madde 1 -" (Transitional articles)
 */

export interface ActIndexEntry {
  id: string;
  lawNumber: number;
  title: string;
  titleEn: string;
  shortName: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issuedDate: string;
  inForceDate: string;
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
    .replace(/&#246;/g, '\u00f6')
    .replace(/&#252;/g, '\u00fc')
    .replace(/&#231;/g, '\u00e7')
    .replace(/&#304;/g, '\u0130')
    .replace(/&#305;/g, '\u0131')
    .replace(/&#350;/g, '\u015e')
    .replace(/&#351;/g, '\u015f')
    .replace(/&#286;/g, '\u011e')
    .replace(/&#287;/g, '\u011f')
    .replace(/\u200B/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .replace(/^\s+|\s+$/gm, '')
    .trim();
}

/**
 * Extract the current chapter/part heading from text preceding an article.
 * Looks for patterns like:
 *   "BIRINCI KISIM" / "IKINCI BOLUM" / "UCUNCU BOLUM"
 *   or "KISIM I" / "BOLUM II" etc.
 */
function extractChapterHeading(textBefore: string): string | undefined {
  // Match Turkish chapter/part headings
  const patterns = [
    // "BIRINCI KISIM - Title" or "BIRINCI BOLUM - Title"
    /(\b(?:B[Ii][Rr][Ii][Nn][Cc][Ii]|[Ii][Kk][Ii][Nn][Cc][Ii]|[Uu\u00dc\u00fc][Cc\u00c7\u00e7][Uu\u00dc\u00fc][Nn][Cc][Uu\u00dc\u00fc]|[Dd][Oo\u00d6\u00f6][Rr][Dd][Uu\u00dc\u00fc][Nn][Cc][Uu\u00dc\u00fc]|[Bb][Ee\u015e\u015f][Ii\u0130\u0131][Nn][Cc][Ii\u0130\u0131]|[Aa][Ll][Tt][Ii\u0130\u0131][Nn][Cc][Ii\u0130\u0131]|[Yy][Ee][Dd][Ii\u0130\u0131][Nn][Cc][Ii\u0130\u0131]|[Ss][Ee][Kk][Ii\u0130\u0131][Zz][Ii\u0130\u0131][Nn][Cc][Ii\u0130\u0131]|[Dd][Oo\u00d6\u00f6][Kk][Uu\u00dc\u00fc][Zz][Uu\u00dc\u00fc][Nn][Cc][Uu\u00dc\u00fc]|[Oo][Nn][Uu\u00dc\u00fc][Nn][Cc][Uu\u00dc\u00fc])\s+(?:K[Ii\u0130\u0131]S[Ii\u0130\u0131]M|B[Oo\u00d6\u00f6]L[Uu\u00dc\u00fc]M))\b/i,
    // Simple "BOLUM N" or "KISIM N"
    /\b((?:K[Ii\u0130\u0131]S[Ii\u0130\u0131]M|B[Oo\u00d6\u00f6]L[Uu\u00dc\u00fc]M)\s+[IVX\d]+)\b/i,
  ];

  // Search backwards through the text for the most recent heading
  const lines = textBefore.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        // Return the line as the chapter heading, cleaned up
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
  const articlePattern = /\b(Madde\s+(\d+(?:\/[A-Z])?)\s*[\-\u2013\u2014])/gi;

  const articleStarts: { fullMatch: string; articleNum: string; index: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = articlePattern.exec(cleanText)) !== null) {
    articleStarts.push({
      fullMatch: match[1],
      articleNum: match[2],
      index: match.index,
    });
  }

  // Also find transitional articles: "Gecici Madde N"
  const geciciPattern = /\b(Ge[c\u00e7]ici\s+Madde\s+(\d+)\s*[\-\u2013\u2014])/gi;
  const geciciStarts: { fullMatch: string; articleNum: string; index: number }[] = [];

  while ((match = geciciPattern.exec(cleanText)) !== null) {
    geciciStarts.push({
      fullMatch: match[1],
      articleNum: match[2],
      index: match.index,
    });
  }

  // Process regular articles
  let currentChapter: string | undefined;

  for (let i = 0; i < articleStarts.length; i++) {
    const start = articleStarts[i];
    const endIndex = i + 1 < articleStarts.length
      ? articleStarts[i + 1].index
      : cleanText.length;

    const articleNum = start.articleNum;
    const numericPart = parseInt(articleNum, 10);

    // Apply article filter if specified (e.g., TCK only arts. 243-246)
    if (act.articleFilter) {
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

    const provisionRef = `madde${articleNum.replace('/', '_')}`;
    const content = `Madde ${articleNum} - ${articleText}`.substring(0, 12000);

    // Try to determine chapter from text before this article
    const textBefore = cleanText.substring(
      Math.max(0, start.index - 500),
      start.index,
    );
    const chapterCandidate = extractChapterHeading(textBefore);
    if (chapterCandidate) {
      currentChapter = chapterCandidate;
    }

    if (content.length > 20) {
      provisions.push({
        provision_ref: provisionRef,
        chapter: currentChapter,
        section: articleNum,
        title,
        content,
      });
    }

    // Extract definitions from "Tanimlar" (Definitions) article - usually Madde 2 or Madde 3
    if (
      title.toLowerCase().includes('tan\u0131m') ||
      title.toLowerCase().includes('tanim') ||
      title.toLowerCase().includes('kavram')
    ) {
      extractDefinitions(articleText, provisionRef, definitions);
    }
  }

  // Process transitional articles
  for (let i = 0; i < geciciStarts.length; i++) {
    const start = geciciStarts[i];
    const endIndex = i + 1 < geciciStarts.length
      ? geciciStarts[i + 1].index
      : cleanText.length;

    const articleNum = start.articleNum;
    const articleText = cleanText.substring(start.index + start.fullMatch.length, endIndex).trim();

    const titleEndMatch = articleText.match(/^([^\n.]+)/);
    const title = titleEndMatch ? titleEndMatch[1].trim().substring(0, 200) : '';

    const provisionRef = `gecici_madde${articleNum}`;
    const content = `Ge\u00e7ici Madde ${articleNum} - ${articleText}`.substring(0, 12000);

    if (content.length > 20) {
      provisions.push({
        provision_ref: provisionRef,
        chapter: 'Ge\u00e7ici Maddeler',
        section: `G${articleNum}`,
        title,
        content,
      });
    }
  }

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
 * Extract term definitions from a "Tanimlar" (Definitions) article.
 *
 * Turkish definition patterns:
 *   "a) Kanun: ..."
 *   "a) Kisisel veri: ..."
 *   "1) Ilgili kisi: ..."
 *   or numbered patterns with Turkish letters
 */
function extractDefinitions(
  articleText: string,
  sourceProvision: string,
  definitions: ParsedDefinition[],
): void {
  // Pattern: letter/number followed by closing paren, then term, then colon, then definition
  // e.g., "a) Kisisel veri: Kimliği belirli veya belirlenebilir ..."
  // Also handles Turkish numbering like "ç)", "ğ)", "ı)", "ö)", "ş)", "ü)"
  const defPattern = /(?:^|\n)\s*(?:[a-z\u00e7\u011f\u0131\u00f6\u015f\u00fc]|\d+)\)\s*([^:]+):\s*([^.]+(?:\.[^.]*)?)/gi;

  let defMatch: RegExpExecArray | null;
  while ((defMatch = defPattern.exec(articleText)) !== null) {
    const term = defMatch[1].trim();
    const definition = defMatch[2].trim();

    if (term.length > 0 && term.length < 100 && definition.length > 5) {
      definitions.push({
        term,
        definition: definition.substring(0, 4000),
        source_provision: sourceProvision,
      });
    }
  }
}

/**
 * Pre-configured list of key Turkish Acts to ingest.
 *
 * Source: mevzuat.gov.tr (Presidency Legislation Information System)
 * URL pattern: https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=XXXX&MevzuatTur=1&MevzuatTertip=5
 *
 * These are the most important laws for cybersecurity, data protection,
 * electronic commerce, and compliance use cases in Turkey.
 */
export const KEY_TURKISH_ACTS: ActIndexEntry[] = [
  {
    id: 'kvkk-6698',
    lawNumber: 6698,
    title: 'Ki\u015fisel Verilerin Korunmas\u0131 Kanunu',
    titleEn: 'Personal Data Protection Law (KVKK)',
    shortName: 'KVKK',
    status: 'in_force',
    issuedDate: '2016-03-24',
    inForceDate: '2016-04-07',
    url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6698&MevzuatTur=1&MevzuatTertip=5',
    description: 'Turkey\'s comprehensive data protection law modeled on EU Directive 95/46/EC; establishes the KVKK Kurumu (Personal Data Protection Authority) as the supervisory body; covers personal data processing, data controller obligations, data subject rights, and cross-border data transfers',
  },
  {
    id: 'law-5651',
    lawNumber: 5651,
    title: '\u0130nternet Ortam\u0131nda Yap\u0131lan Yay\u0131nlar\u0131n D\u00fczenlenmesi ve Bu Yay\u0131nlar Yoluyla \u0130\u015flenen Su\u00e7larla M\u00fccadele Edilmesi Hakk\u0131nda Kanun',
    titleEn: 'Law on Regulation of Publications on the Internet and Combating Crimes Committed through Such Publications (Internet Law)',
    shortName: 'Law 5651',
    status: 'in_force',
    issuedDate: '2007-05-04',
    inForceDate: '2007-05-23',
    url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=5651&MevzuatTur=1&MevzuatTertip=5',
    description: 'Turkey\'s primary internet regulation law; defines responsibilities of content providers, hosting providers, and access providers; establishes URL/content blocking procedures; internationally notable for its content restriction provisions; significantly amended multiple times since 2007',
  },
  {
    id: 'tck-5237',
    lawNumber: 5237,
    title: 'T\u00fcrk Ceza Kanunu',
    titleEn: 'Turkish Criminal Code (TCK)',
    shortName: 'TCK',
    status: 'in_force',
    issuedDate: '2004-09-26',
    inForceDate: '2005-06-01',
    url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=5237&MevzuatTur=1&MevzuatTertip=5',
    description: 'Turkish Criminal Code; articles 243-246 cover cybercrime: unauthorized access to information systems (art. 243), damaging/altering/destroying data (art. 244), misuse of bank/credit cards (art. 245), and related provisions (art. 246)',
    articleFilter: { from: 243, to: 246 },
  },
  {
    id: 'ttk-6102',
    lawNumber: 6102,
    title: 'T\u00fcrk Ticaret Kanunu',
    titleEn: 'Turkish Commercial Code (TTK)',
    shortName: 'TTK',
    status: 'in_force',
    issuedDate: '2011-01-13',
    inForceDate: '2012-07-01',
    url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6102&MevzuatTur=1&MevzuatTertip=5',
    description: 'Turkey\'s modern Commercial Code replacing the 1956 code; covers commercial enterprises, companies, securities, maritime commerce, and insurance; includes provisions on electronic commerce, corporate governance, and commercial registers',
  },
  {
    id: 'ecommerce-6563',
    lawNumber: 6563,
    title: 'Elektronik Ticaretin D\u00fczenlenmesi Hakk\u0131nda Kanun',
    titleEn: 'Law on the Regulation of Electronic Commerce',
    shortName: 'E-Commerce Law',
    status: 'in_force',
    issuedDate: '2014-10-23',
    inForceDate: '2015-05-01',
    url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6563&MevzuatTur=1&MevzuatTertip=5',
    description: 'Regulates electronic commerce in Turkey; covers commercial electronic messages, service provider obligations, consumer protection in e-commerce, and electronic contracts',
  },
  {
    id: 'constitution-2709',
    lawNumber: 2709,
    title: 'T\u00fcrkiye Cumhuriyeti Anayasas\u0131',
    titleEn: 'Constitution of the Republic of Turkey',
    shortName: 'Anayasa',
    status: 'in_force',
    issuedDate: '1982-11-07',
    inForceDate: '1982-11-09',
    url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=2709&MevzuatTur=1&MevzuatTertip=5',
    description: 'Supreme law of Turkey; Article 20 guarantees the right to privacy (\u00f6zel hayat\u0131n gizlili\u011fi) and was amended in 2010 to add explicit personal data protection provisions; Article 22 protects freedom of communication; Article 26 protects freedom of expression',
  },
  {
    id: 'ecom-law-5809',
    lawNumber: 5809,
    title: 'Elektronik Haberle\u015fme Kanunu',
    titleEn: 'Electronic Communications Law',
    shortName: 'EHK',
    status: 'in_force',
    issuedDate: '2008-11-05',
    inForceDate: '2008-11-10',
    url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=5809&MevzuatTur=1&MevzuatTertip=5',
    description: 'Turkey\'s primary telecommunications law; establishes the BTK (Information and Communication Technologies Authority) as the telecommunications regulator; covers licensing, spectrum management, universal service, consumer protection, and data retention',
  },
  {
    id: 'esig-law-5070',
    lawNumber: 5070,
    title: 'Elektronik \u0130mza Kanunu',
    titleEn: 'Electronic Signature Law',
    shortName: 'E-Signature Law',
    status: 'in_force',
    issuedDate: '2004-01-15',
    inForceDate: '2004-07-23',
    url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=5070&MevzuatTur=1&MevzuatTertip=5',
    description: 'Regulates electronic signatures and certification service providers in Turkey; establishes legal validity of electronic signatures; aligned with EU Electronic Signatures Directive 1999/93/EC',
  },
  {
    id: 'payment-law-6493',
    lawNumber: 6493,
    title: '\u00d6deme ve Menkul K\u0131ymet Mutabakat Sistemleri, \u00d6deme Hizmetleri ve Elektronik Para Kurulu\u015flar\u0131 Hakk\u0131nda Kanun',
    titleEn: 'Law on Payment and Securities Settlement Systems, Payment Services, and Electronic Money Institutions',
    shortName: 'Payment Services Law',
    status: 'in_force',
    issuedDate: '2013-06-20',
    inForceDate: '2013-06-27',
    url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6493&MevzuatTur=1&MevzuatTertip=5',
    description: 'Regulates payment systems, payment services, and electronic money institutions in Turkey; covers licensing of payment institutions, consumer protection, and operational requirements; influenced by EU Payment Services Directive (PSD)',
  },
  {
    id: 'btk-regulation-5809-secondary',
    lawNumber: 5809,
    title: 'BTK D\u00fczenleme - Elektronik Haberle\u015fme Sekt\u00f6r\u00fc',
    titleEn: 'BTK Regulations - Electronic Communications Sector',
    shortName: 'BTK Regs',
    status: 'in_force',
    issuedDate: '2008-11-05',
    inForceDate: '2008-11-10',
    url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=5809&MevzuatTur=1&MevzuatTertip=5',
    description: 'BTK (Bilgi Teknolojileri ve \u0130leti\u015fim Kurumu / Information and Communication Technologies Authority) regulatory framework; covers telecommunications licensing, spectrum management, interconnection, and cybersecurity requirements for telecom operators',
  },
];
