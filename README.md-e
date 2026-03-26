# Turkish Law MCP Server

**The mevzuat.gov.tr alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Fturkish-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/turkish-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/turkish-law-mcp?style=social)](https://github.com/Ansvar-Systems/turkish-law-mcp)
[![CI](https://github.com/Ansvar-Systems/turkish-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/turkish-law-mcp/actions/workflows/ci.yml)
[![Daily Data Check](https://github.com/Ansvar-Systems/turkish-law-mcp/actions/workflows/check-updates.yml/badge.svg)](https://github.com/Ansvar-Systems/turkish-law-mcp/actions/workflows/check-updates.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)](docs/EU_INTEGRATION_GUIDE.md)
[![Provisions](https://img.shields.io/badge/provisions-21%2C732-blue)](docs/EU_INTEGRATION_GUIDE.md)

Query **994 Turkish laws** -- from KVKK and Anayasa to Siber Guvenlik Kanunu, Turk Ticaret Kanunu, and more -- directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Turkish legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Why This Exists

Turkish legal research requires navigating mevzuat.gov.tr, Resmi Gazete archives, and scattered regulatory databases. Whether you're:
- A **lawyer** validating citations in a contract or filing
- A **compliance officer** checking KVKK data protection requirements
- A **legal tech developer** building tools on Turkish law
- A **researcher** analyzing Turkish legislative structure

...you shouldn't need to navigate a government portal with iframe-embedded Word documents. Ask Claude. Get the exact provision. With context.

This MCP server makes Turkish law **searchable, cross-referenceable, and AI-readable**.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://turkish-law-mcp.vercel.app/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add turkish-law --transport http https://turkish-law-mcp.vercel.app/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "turkish-law": {
      "type": "url",
      "url": "https://turkish-law-mcp.vercel.app/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "turkish-law": {
      "type": "http",
      "url": "https://turkish-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/turkish-law-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "turkish-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/turkish-law-mcp"]
    }
  }
}
```

## Example Queries

Once connected, just ask naturally:

- *"KVKK Madde 5 ne diyor? Kisisel verilerin islenmesi sartlari nedir?"*
- *"What does Article 20 of the Turkish Constitution say about privacy?"*
- *"Siber Guvenlik Kanunu'nun amaci nedir?"*
- *"Elektronik ticaret ile ilgili Turk mevzuatini bul"*
- *"KVKK'da veri sorumlusunun yukumlulukleri nelerdir?"*
- *"Find provisions about bilisim suclari in Turkish criminal law"*
- *"What are the penalties under Law 5651 for internet regulation violations?"*
- *"Turk Ticaret Kanunu'nda elektronik ticaret hukumleri neler?"*

---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **Laws (Kanunlar)** | 898 laws | All in-force Turkish laws from mevzuat.gov.tr |
| **Decree Laws (KHK)** | 63 | Kanun Hukmunde Kararnameler |
| **Presidential Decrees** | 33 | Cumhurbaskanligi Kararnameleri |
| **Provisions** | 21,732 articles | Full-text searchable with FTS5 |
| **Legal Definitions** | 3,819 terms | Extracted from Tanimlar articles |
| **Database Size** | ~49 MB | Optimized SQLite, portable |
| **Daily Updates** | Automated | Freshness checks against mevzuat.gov.tr |

**Verified data only** -- every provision is ingested from the official Cumhurbaskanligi Mevzuat Bilgi Sistemi (mevzuat.gov.tr). Zero LLM-generated content.

### Key Laws Included

| Law | Number | Description |
|-----|--------|-------------|
| **KVKK** | 6698 | Personal Data Protection Law |
| **Anayasa** | 2709 | Constitution of the Republic of Turkey |
| **Siber Guvenlik Kanunu** | 7545 | Cybersecurity Law |
| **Iklim Kanunu** | 7552 | Climate Law |
| **Law 5651** | 5651 | Internet Regulation Law |
| **TCK** | 5237 | Turkish Criminal Code (including cybercrime arts. 243-246) |
| **TTK** | 6102 | Turkish Commercial Code |
| **E-Commerce Law** | 6563 | Electronic Commerce Regulation |
| **EHK** | 5809 | Electronic Communications Law |
| **E-Signature Law** | 5070 | Electronic Signature Law |
| **Payment Services** | 6493 | Payment Services and Electronic Money Law |

---

## See It In Action

### Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from mevzuat.gov.tr official HTML pages
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing -- the database contains regulation text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by law number + article number
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
mevzuat.gov.tr API -> Census -> Ingest -> Parse -> SQLite -> FTS5 snippet() -> MCP response
                        |                   |
                  994 laws enumerated   Article parser (Madde/Gecici Madde/Ek Madde)
```

---

## Available Tools (8)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 search on 21,732 provisions with BM25 ranking |
| `get_provision` | Retrieve specific provision by law name + article number |
| `validate_citation` | Validate citation against database (zero-hallucination check) |
| `build_legal_stance` | Aggregate citations from multiple statutes |
| `format_citation` | Format citations per Turkish legal conventions |
| `check_currency` | Check if statute is in force, amended, or repealed |
| `get_eu_basis` | Get EU directives/regulations referenced in Turkish statute |
| `get_provision_eu_basis` | Get EU law references for specific provision |

---

## Data Sources & Freshness

All content is sourced from the authoritative Turkish government legislation portal:

- **[mevzuat.gov.tr](https://www.mevzuat.gov.tr)** -- Cumhurbaskanligi Mevzuat Bilgi Sistemi (Presidency Legislation Information System)
- **[Resmi Gazete](https://www.resmigazete.gov.tr)** -- Official Gazette of Turkey (for publication dates)

### Census-Driven Ingestion

The ingestion pipeline follows a census-first approach:

1. **Census** (`scripts/census.ts`): Calls the MevzuatDatatable API to enumerate all laws
2. **Ingest** (`scripts/ingest.ts`): Fetches each law's full text via the iframe content endpoint
3. **Parse** (`scripts/lib/parser.ts`): Extracts articles (Madde), transitional articles (Gecici Madde), additional articles (Ek Madde), and definitions
4. **Build** (`scripts/build-db.ts`): Compiles all seed files into the SQLite database with FTS5

### Automated Freshness Checks (Daily)

A [daily GitHub Actions workflow](.github/workflows/check-updates.yml) monitors mevzuat.gov.tr for:

| Check | Method |
|-------|--------|
| **New laws** | MevzuatDatatable API pagination |
| **Amendments** | Content hash comparison |
| **Repealed laws** | Status field monitoring |

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from official mevzuat.gov.tr publications. However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Verify critical citations** against primary sources for court filings
> - **Amendment tracking** may have delays -- always check mevzuat.gov.tr for the latest version
> - Some laws (especially amendment laws) may have 0 parsed provisions if they only modify other statutes

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [PRIVACY.md](PRIVACY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment. See [PRIVACY.md](PRIVACY.md).

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/turkish-law-mcp
cd turkish-law-mcp
npm install
npm run build
```

### Data Management

```bash
npm run census                          # Enumerate all laws from mevzuat.gov.tr
npm run ingest                          # Full ingestion (census-driven)
npm run ingest -- --limit 10            # Test with 10 laws
npm run ingest -- --resume              # Resume from where you left off
npm run ingest -- --skip-fetch          # Reuse cached HTML
npm run build:db                        # Rebuild SQLite database
npm run check-updates                   # Check for amendments
npm run drift:detect                    # Detect data drift
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Database Size:** ~49 MB (efficient, portable)
- **Ingestion Time:** ~9 minutes for full corpus (994 laws)
- **Zero failures:** 100% ingestion success rate

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** -- MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query 49 EU regulations directly from Claude** -- GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. `npx @ansvar/eu-regulations-mcp`

### [@ansvar/swedish-law-mcp](https://github.com/Ansvar-Systems/swedish-law-mcp)
**Query 2,415 Swedish statutes directly from Claude** -- DSL, BrB, ABL, MB, and more. `npx @ansvar/swedish-law-mcp`

### [@ansvar/us-regulations-mcp](https://github.com/Ansvar-Systems/US_Compliance_MCP)
**Query US federal and state compliance laws** -- HIPAA, CCPA, SOX, GLBA, FERPA, and more. `npx @ansvar/us-regulations-mcp`

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- EU cross-reference extraction (Turkey is an EU candidate country)
- English translations for key statutes
- Amendment history tracking
- Secondary legislation (Yonetmelikler, Tebligler)

---

## Roadmap

- [x] **Full corpus census** -- 994 laws enumerated from MevzuatDatatable API
- [x] **Census-driven ingestion** -- 21,732 provisions from 994 laws
- [x] **Definition extraction** -- 3,819 legal definitions
- [x] **FTS5 full-text search** -- unicode61 tokenizer for Turkish text
- [ ] EU cross-reference extraction (KVKK -> GDPR, etc.)
- [ ] Secondary legislation (Yonetmelikler, Tuzukler)
- [ ] English translations for key statutes
- [ ] Historical statute versions (amendment tracking)

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{turkish_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Turkish Law MCP Server: Production-Grade Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/turkish-law-mcp},
  note = {Comprehensive Turkish legal database with 994 laws and 21,732 provisions}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes & Legislation:** Cumhurbaskanligi Mevzuat Bilgi Sistemi (Government Public Data)
- **Official Gazette Metadata:** Resmi Gazete (public domain)

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the European market. This MCP server makes Turkish law searchable, cross-referenceable, and AI-readable -- so you can focus on analysis, not navigation.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
