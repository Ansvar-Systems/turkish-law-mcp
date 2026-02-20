# Turkish Law MCP

[![npm](https://img.shields.io/npm/v/@ansvar/turkish-law-mcp)](https://www.npmjs.com/package/@ansvar/turkish-law-mcp)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/Ansvar-Systems/turkish-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/turkish-law-mcp/actions/workflows/ci.yml)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-green)](https://registry.modelcontextprotocol.io/)
[![OpenSSF Scorecard](https://img.shields.io/ossf-scorecard/github.com/Ansvar-Systems/turkish-law-mcp)](https://securityscorecards.dev/viewer/?uri=github.com/Ansvar-Systems/turkish-law-mcp)

A Model Context Protocol (MCP) server providing comprehensive access to Turkish legislation, including KVKK (Kisisel Verilerin Korunmasi Kanunu -- Data Protection Law No. 6698), Law No. 5651 (Internet Regulation), Turk Ceza Kanunu (TCK -- Criminal Code with cybercrime provisions), Turk Ticaret Kanunu (TTK -- Commercial Code No. 6102), Law No. 6563 (Electronic Commerce), and BTK telecommunications regulations. All data sourced from the official mevzuat.gov.tr legislation database operated by the Presidency of the Republic of Turkey.

## Deployment Tier

**MEDIUM** -- Dual tier with bundled free database for Vercel deployment.

**Estimated database size:** ~80-150 MB (free tier, core legislation)

## Key Legislation Covered

| Act | Turkish Name | Significance |
|-----|-------------|-------------|
| **KVKK (Data Protection Law No. 6698)** | Kisisel Verilerin Korunmasi Kanunu | Turkey's comprehensive DPA (2016); modeled on EU DPD 95/46/EC; GDPR alignment ongoing as EU candidate |
| **Law No. 5651 (Internet Regulation)** | Internet Ortaminda Yapilan Yayinlarin Duzenlenmesi Kanunu | Primary internet content regulation; internationally notable for content blocking provisions |
| **TCK (Criminal Code)** | Turk Ceza Kanunu | Cybercrime provisions: Art. 243 (unauthorized access), 244 (data damage), 245 (card misuse), 246 |
| **TTK (Commercial Code No. 6102)** | Turk Ticaret Kanunu | Modern commercial law (2012); corporate governance, e-commerce provisions |
| **Law No. 6563 (Electronic Commerce)** | Elektronik Ticaretin Duzenlenmesi Kanunu | Electronic commerce regulation; commercial electronic messages, service provider obligations |
| **BTK Regulations** | Bilgi Teknolojileri ve Iletisim Kurumu | Telecommunications authority regulations |
| **Constitution** | Turkiye Cumhuriyeti Anayasasi | Art. 20 protects right to privacy; 2010 amendment added explicit personal data protection |

## Regulatory Context

- **Data Protection Authority:** KVKK Kurumu (Kisisel Verileri Koruma Kurumu), established in 2016 with active enforcement; Turkey's first dedicated DPA
- **EU Candidate Status:** Turkey is an EU candidate country. The KVKK was originally modeled on the EU Data Protection Directive 95/46/EC. Adequacy negotiations with the EU under the GDPR are ongoing, making Turkey a significant jurisdiction for companies operating in both EU and Turkish markets
- **Internet Regulation:** Law No. 5651 (2007, significantly amended) is internationally notable for its content blocking and takedown provisions; it requires content providers, hosting providers, and access providers to comply with removal orders
- **Cybercrime:** TCK articles 243-246 provide comprehensive cybercrime coverage including unauthorized access, data damage/alteration, and misuse of bank/credit cards
- **Legal System:** Civil law system (Swiss-influenced); Turkish is the sole official language
- **Citation Format:** Resmi Gazete (Official Gazette) date and number; Law number (Kanun No.)

## Data Sources

| Source | Authority | Method | Update Frequency | License | Coverage |
|--------|-----------|--------|-----------------|---------|----------|
| [mevzuat.gov.tr](https://www.mevzuat.gov.tr) | Presidency of Turkey | HTML Scrape | Daily | Government Public Data | All Turkish legislation (kanun, kararname, yonetmelik, teblig) |
| [KVKK (kvkk.gov.tr)](https://www.kvkk.gov.tr) | Personal Data Protection Authority | HTML Scrape | Monthly | Government Publication | Board decisions, guidelines, sector guidance |

> Full provenance metadata: [`sources.yml`](./sources.yml)

## Installation

```bash
npm install -g @ansvar/turkish-law-mcp
```

## Usage

### As stdio MCP server

```bash
turkish-law-mcp
```

### In Claude Desktop / MCP client configuration

```json
{
  "mcpServers": {
    "turkish-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/turkish-law-mcp"]
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `get_provision` | Retrieve a specific article (Madde) from a Turkish law |
| `search_legislation` | Full-text search across all Turkish legislation |
| `get_provision_eu_basis` | Cross-reference lookup for EU/international framework relationships (GDPR, EU candidacy context) |
| `validate_citation` | Validate a legal citation against the database (Resmi Gazete references, Kanun numbers) |
| `check_statute_currency` | Check whether a law or provision is the current consolidated version |
| `list_laws` | List all laws in the database with metadata |

## Deployment Tiers

| Tier | Content | Database Size | Platform |
|------|---------|---------------|----------|
| **Free** | All major statutes + EU cross-references | ~80-150 MB | Vercel (bundled) or local |
| **Professional** | + KVKK decisions + BTK regulations + historical consolidated versions + presidential decrees | ~400-700 MB | Azure Container Apps / Docker / local |

### Deployment Strategy: MEDIUM - Dual Tier, Bundled Free

The free-tier database containing core legislation is estimated at 80-150 MB, within the Vercel 250 MB bundle limit. The free-tier database is bundled directly with the Vercel deployment. The professional tier with KVKK decisions, BTK regulations, and extended coverage requires local Docker or Azure Container Apps deployment.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run contract tests
npm run test:contract

# Run all validation
npm run validate

# Build database from sources
npm run build:db

# Start server
npm start
```

## Contract Tests

This MCP includes 12 golden contract tests covering:
- 4 article retrieval tests (KVKK Art 1, TCK Art 243, TTK Art 1, Law 5651 Art 1)
- 3 search tests (kisisel veri, siber guvenlik, elektronik ticaret)
- 2 citation roundtrip tests (mevzuat.gov.tr URL patterns, Resmi Gazete references)
- 1 cross-reference test (KVKK to GDPR -- EU candidate context)
- 2 negative tests (non-existent law, malformed article)

Run with: `npm run test:contract`

## Security

See [SECURITY.md](./.github/SECURITY.md) for vulnerability disclosure policy.

Report data errors: [Open an issue](https://github.com/Ansvar-Systems/turkish-law-mcp/issues/new?template=data-error.md)

## License

Apache-2.0 -- see [LICENSE](./LICENSE)

The law text itself is public domain under Turkish government public data policy. This project's code and database structure are licensed under Apache-2.0.

---

Built by [Ansvar Systems](https://ansvar.eu) -- Cybersecurity compliance through AI-powered analysis.
