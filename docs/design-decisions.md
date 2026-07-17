# Design decisions

## Two-stage triage (the central choice)

The system separates **finding discrepancies** from **reasoning about them**. A
deterministic rules engine (`matching.ts`) compares each invoice to the PO register and
emits structured exception flags; the LLM then reasons over those facts and produces a
business-language recommendation, rationale, and confidence. This directly answers the
brief's caution against "if/else logic masquerading as AI." Deterministic checks are
auditable and unit-tested (15/15 assessment cases pass); the model adds the judgement
and plain-English explanation an analyst would otherwise write by hand. It also keeps
the AI honest — it reasons over verified facts rather than re-deriving arithmetic it is
poor at.

## AI assists, humans decide

Every recommendation is overridable. Both the AI decision and the human override are
written to an immutable `audit_log`, which is what makes the dashboard's **override
rate** measurable — a real signal of whether the model can be trusted with more
autonomy over time. The AI never auto-actions an invoice.

## Graceful degradation

Any LLM failure (missing key, timeout, rate limit, malformed JSON) falls back to a
deterministic recommendation derived from the same flags, and the UI labels it as a
fallback with a retry affordance. This is a genuine reliability feature: a Finance tool
cannot stall because a third-party API is briefly unavailable.

## Stack

Next.js + Prisma + SQLite in one repo so a single `npm run dev` serves UI and API —
the simplest thing to demo live. Prompts are externalised to `prompts/invoice-triage.md`
so they can be reviewed and iterated without a redeploy, and are viewable in-app.

## Data integrity

Invoice `poNumber` is stored as free text, **not** a foreign key. Real intake includes
invoices citing POs that do not exist in the register (e.g. `PO-2024-999`) — that is
precisely the exception we must detect, so the schema must accept it rather than reject
it at insert time. The assessment data is loaded verbatim.

## The Vendor table vs. the Process 3 vendor master

The schema includes a deliberately **minimal** `Vendor` table — `id`, `name`, and a
relation to purchase orders. This is *not* scope creep into Process 3; it is the
**approved-vendor list** that Process 1 itself needs. At triage time
`triage-service.ts` loads it (`prisma.vendor.findMany()`) and passes the names to the
matching engine, which raises the `UNKNOWN_VENDOR` exception when an invoice's vendor
is not on the list (`matching.ts`). It also lets the PO register carry a proper
`vendorId` foreign key instead of a loose string.

What is intentionally **not** built is the richer Process 3 *vendor master* from §3.3
(`abn`, `bank_account`, `category`, `risk_tier`, `onboarding_status`,
`screening_notes`). Those fields support vendor onboarding and risk screening —
Process 3 concerns, not invoice triage — so including them would be speculative scope.
In short: the approved-vendor list is a genuine Process 1 dependency; the vendor
*master* is out of scope. This is why the schema header notes the "vendors master"
as omitted even though a lightweight `Vendor` table is present.

## What was deliberately NOT built

- **PDF invoice parsing.** The upload path accepts JSON and manual entry. Robust PDF/OCR
  extraction is a project in itself; the triage logic — the part being assessed — is
  identical regardless of how fields arrive, so I stubbed intake and focused effort there.
- **Processes 2 and 3.** Only the Invoice Exception Triage schema and flows exist. Adding
  speculative tables for unbuilt processes would be scope creep.
- **Role-based permissions.** Analyst and approver accounts exist, but both can act. A
  real deployment would gate high-value approvals by role and add approval thresholds.
- **Production hardening.** SQLite (not Postgres), no rate limiting, no retry queue for
  the LLM, no test framework (a dependency-free script covers the rules engine). All
  appropriate for a local proof-of-concept, all called out here as known next steps.
