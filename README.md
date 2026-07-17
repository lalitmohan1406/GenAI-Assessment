# FinanceOS — Invoice Exception Triage

An AI-augmented proof-of-concept that helps an Accounts Payable team clear **invoice
exceptions** faster. Invoices are matched against a purchase-order register by a
deterministic rules engine; a Large Language Model then reasons over the detected
discrepancies and produces a plain-English recommendation (approve / escalate / reject)
with a rationale and confidence score. Every AI output is overridable by a human, and
both the AI decision and the human override are written to an immutable audit log.

> Built for the **ES GenAI Deployment technical assessment — Process 1**.

---

## The core idea: two-stage triage

The design deliberately separates *finding the facts* from *communicating the judgement*:

1. **Stage 1 — deterministic rules engine** (`src/lib/matching.ts`).
   A pure function compares an invoice to the PO register and emits structured
   **exception flags** (`MISSING_PO`, `PO_NOT_FOUND`, `UNKNOWN_VENDOR`, `PO_CLOSED`,
   `VENDOR_MISMATCH`, `OVER_PO`, `UNDER_PO`, `DUPLICATE`). No AI here — this is
   auditable, testable, and reproducible.

2. **Stage 2 — LLM reasoning** (`src/lib/llm.ts`).
   Claude receives the invoice, the matched PO context, and the flags from Stage 1,
   and returns a business-language recommendation + rationale + confidence as
   structured JSON (validated with zod).

This answers the assessment's warning against "if/else logic masquerading as AI":
the rules find the discrepancies, and the model provides the reasoning and language a
Finance analyst would otherwise have to write by hand.

**Graceful degradation:** if the Anthropic call fails for any reason (no API key,
timeout, rate limit, or malformed JSON), the app falls back to a deterministic
recommendation derived from the same flags and clearly labels it as a fallback in the
UI. The product is fully usable without a live model.

---

## Tech stack

| Layer      | Choice                                        |
| ---------- | --------------------------------------------- |
| Framework  | Next.js 14 (App Router, TypeScript)           |
| UI         | React + Tailwind CSS                          |
| Database   | SQLite via Prisma ORM                         |
| AI         | Anthropic Claude (`@anthropic-ai/sdk`)        |
| Auth       | JWT session cookie (`jose`) + bcrypt          |
| Validation | zod                                           |

A single `npm run dev` serves both the UI and the API — the simplest thing to demo
live.

---

## Prerequisites

- Node.js 18.18+ (or 20+)
- npm

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
#    then edit .env — set AUTH_SECRET, and optionally ANTHROPIC_API_KEY

# 3. Create the database schema and seed the assessment data
npm run db:reset      # runs migrations + seeds POs, invoices, vendors, users

# 4. Start the app
npm run dev
```

Open <http://localhost:3000> and sign in with a seeded account below.

### Environment variables

| Variable            | Required | Purpose                                                              |
| ------------------- | -------- | -------------------------------------------------------------------- |
| `DATABASE_URL`      | yes      | SQLite file location (default `file:./dev.db`).                      |
| `AUTH_SECRET`       | yes      | Signs the JWT session cookie. `openssl rand -base64 32`.             |
| `ANTHROPIC_API_KEY` | no       | Enables live Claude triage. If blank, the deterministic fallback is used. |
| `ANTHROPIC_MODEL`   | no       | Claude model id (default `claude-sonnet-4-5`).                       |

> **Running without a key:** the app runs end-to-end on the deterministic fallback and
> labels every recommendation as `fallback` in the UI. Add a key later to see live
> Claude output — no code changes needed.

### Seeded demo accounts

| Role     | Email                    | Password   |
| -------- | ------------------------ | ---------- |
| Analyst  | `analyst@financeos.dev`  | `demo1234` |
| Approver | `approver@financeos.dev` | `demo1234` |

Seeded invoices load as **pending / un-triaged** so you can trigger AI triage live
during a demo.

---

## npm scripts

| Script                 | What it does                                                    |
| ---------------------- | --------------------------------------------------------------- |
| `npm run dev`          | Start the dev server.                                           |
| `npm run build`        | Production build.                                               |
| `npm run start`        | Serve the production build.                                     |
| `npm run lint`         | ESLint.                                                         |
| `npm run db:migrate`   | Apply Prisma migrations (development).                          |
| `npm run db:seed`      | Seed the assessment data.                                       |
| `npm run db:reset`     | Drop, re-migrate, and re-seed — proves repeatable migrations.   |
| `npm run test:matching`| Run the rules-engine tests against all 15 seeded invoices.      |

---

## Application map

| Route            | Purpose                                                              |
| ---------------- | -------------------------------------------------------------------- |
| `/login`         | Sign in (demo credentials pre-filled).                               |
| `/`              | Dashboard — exception volume, AI-vs-human override rate, avg resolution time. |
| `/invoices`      | Invoice list with status filters.                                    |
| `/invoices/new`  | Manual entry or JSON upload.                                         |
| `/invoices/[id]` | Triage cockpit — facts, matched PO, flags, AI recommendation, human override. |
| `/prompts`       | Renders the externalised prompt template in-app.                     |

---

## Project structure

```
prisma/
  schema.prisma        # data model: User, Vendor, PurchaseOrder, Invoice, AuditLog
  seed.ts              # Appendix A data, verbatim
src/
  lib/
    matching.ts        # Stage 1 — deterministic exception engine (no AI)
    matching.test.ts   # 15 assessment cases, no framework
    llm.ts             # Stage 2 — Claude call + zod validation + fallback
    prompt.ts          # loads/fills the externalised prompt template
    triage-service.ts  # orchestrates Stage 1 + Stage 2 and persists results
    auth.ts            # JWT session helpers
    audit.ts           # immutable audit-log writer
    prisma.ts          # PrismaClient singleton
  app/
    api/...            # login/logout/me, invoices, override, retriage, dashboard, prompts
    ...page.tsx        # UI pages
  middleware.ts        # route protection
prompts/
  invoice-triage.md    # externalised system + user prompt
docs/
  architecture.svg/png/pdf
  design-decisions.md
```

---

## Testing the rules engine

```bash
npm run test:matching
```

Verifies the deterministic engine's output for all 15 seeded invoices against the
expected results in Appendix A2 of the assessment.

---

## Documentation

- [`docs/design-decisions.md`](docs/design-decisions.md) — architecture rationale and
  what was intentionally left out.
- [`docs/architecture.png`](docs/architecture.png) — stakeholder-readable architecture
  diagram (also available as `.svg` and `.pdf`).
