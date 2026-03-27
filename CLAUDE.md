# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (Turbopack)
npm run build    # Production build
npm run lint     # ESLint
```

No test suite is configured. Verify changes by running the dev server and testing in browser.

## Architecture

**Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind 4, Supabase (Postgres + Auth)
**Deployed:** Vercel (auto-deploy from `main`). Work on feature branches / worktrees, merge to `main` to deploy.
**Live URL:** https://valeur-europe-postrade.vercel.app

### Route structure

All authenticated pages live under `app/(protected)/` with a shared sidebar layout (`layout.tsx`). Auth is enforced client-side in that layout — no `middleware.ts`. The layout checks `supabase.auth.getSession()` on mount, fetches `profiles.active`, and redirects to `/login` if unauthenticated or inactive.

Menu items marked `adminOnly: true` are hidden from `readonly` and `sales` role users. Sales role users are additionally restricted to `/dashboard` and `/blotter` — all other routes redirect to `/dashboard`.

### Supabase — two client patterns

| Where | Key used | Import |
|---|---|---|
| Client components (`"use client"`) | Anon key | `import { supabase } from "@/src/lib/supabase"` |
| API routes | Service role key (bypasses RLS) | Created inline in route file |

API routes always set `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`. File download responses use `new NextResponse(new Uint8Array(buffer), { headers })`.

### Key database tables

- `trades` — core trade record; booked/cancelled trades are locked by trigger `prevent_update_delete_booked()` (only pending trades can be deleted; booked trades can only be cancelled)
- `trade_legs` — buy/sell legs per trade (`leg: 'buy'|'sell'` from **dealer/RiverRock perspective** — always invert for counterparty-facing display)
- `products`, `issuers`, `counterparties`, `advisors` (clients), `contacts`, `profiles`
- `group_entities` — booking/distributing entities (Valeur, RiverRock); has `entity_type` column (`'valeur'|'riverrock'|'other'`) used for template selection — do NOT use legal name string matching
- `counterparty_contacts`, `advisor_contacts`, `group_entity_contacts` — contacts per entity type
- `counterparty_billing` — one row per counterparty: postal_address, vat_number, billing_email
- `counterparty_bank_accounts` — multiple per counterparty; currency, bank_name, iban, bic, intermediary_bic (SWIFT chains), sort_code / account_number (UK accounts)
- `sales_people` — id, first_name, family_name, email; master list for sales staff
- `mifid_reports` — MiFID report metadata (trade_date, file_name, batch flag)
- `mifid_report_trades` — trade_id → report_id link; has `arm_status` ('pending' | 'confirmed')
- `invoices` — receivables tracking per trade: downloaded_at, payment_status ('pending' | 'paid')
- `retro_payments` — payables per (trade, recipient_type); recipient_type: 'client' | 'introducer' | 'custodian'; 4-state payment_status enum
- `trade_tickets` — log of generated ticket files (leg_id, contact_id, format, generated_by)
- `fx_rates` — refreshed by Supabase cron (`fx-refresh-ecb`); columns: `quote_ccy`, `rate_date`, `rate`; `get_fx_health()` DB function drives the FX status widget. Supports historical backfill via POST to the edge function with `{ start_date, end_date }` body.

### Sales role & RLS

Three roles in the `user_role` enum: `admin`, `readonly`, `sales`.

**profiles table additions:**
- `profiles.role` — `'admin' | 'readonly' | 'sales'`
- `profiles.sales_person_id` — FK → `sales_people.id`; links the logged-in user to their sales record

**Helper function:** `get_my_sales_name()` (SECURITY DEFINER) — returns `first_name || ' ' || family_name` for the current user's linked sales person.

**RLS on `trades` and `trade_legs`:**
- Permissive SELECT: `is_active_user()` (existing pattern)
- RESTRICTIVE SELECT: non-sales users bypass; sales users see only rows where `trades.sales_name = get_my_sales_name()`
- `trades_analytics_v` has `security_invoker = true` so RLS propagates through the view

**Account creation (manual, no UI):** Create auth user in Supabase dashboard → insert `profiles` row with `role = 'sales'` and `sales_person_id` pointing to the correct `sales_people` record.

**Client-side enforcement:** Dashboard and Blotter detect `role === 'sales'`, lock the Sales filter to the user's own name, and make it read-only.

### Trade Tickets wizard (`app/(protected)/trade-tickets/`)

6-step wizard: Step1=search → Step2=leg preview → Step3=validation → Step4=contact selection → Step5=preview → Step6=export.

- **PNG** template rendered via `TicketTemplate.tsx` (client-side, `html-to-image`)
- **DOCX** generated server-side via `docx` package in `app/api/trade-tickets/generate/route.ts`
- **PDF** generated server-side via `pdfkit` (needs `serverExternalPackages: ["pdfkit"]` in `next.config.ts`)
- Template selection (Valeur vs RiverRock) uses `leg.distributingEntityType === "valeur"` — never match on legal name string
- Valeur logo: `app/icon.svg` converted to white PNG via `sharp` at generation time
- RiverRock SSI: two-step DB query (fetch opposite-direction leg's counterparty SSI)

### NewTradeForm (`app/(protected)/components/NewTradeForm.tsx`)

Used for new trade, edit, and clone modes. Includes localStorage draft persistence — draft key is `trade-draft-${mode}-${sourceTradeId ?? "new"}`. The sourceTradeId effect skips DB fetch if a draft exists (draft restore handles population). `prevent_update_delete_booked` DB trigger must return `OLD` (not `NEW`) for DELETE operations on pending trades.

### Invoicing (`app/(protected)/invoicing/`)

- **Receivables** filtered by `group_entities.entity_type = 'riverrock'`
- **Payables** expanded per (trade, recipient_type): 'client', 'introducer', 'custodian'
- **Internal counterparty for billing:** fetch by `cp_type = 'internal'` AND match `legal_name` against the RiverRock entity name (from `group_entities.entity_type = 'riverrock'`) — required because multiple counterparties may share `cp_type = 'internal'`
- **Invoice PDF:** generated client-side via `html-to-image` (JPEG, pixelRatio 2, quality 0.85) + `jsPDF`; downloads directly as `.pdf` without browser print dialog
- Bank account selection: if multiple accounts exist for the invoice currency, user picks one before export

### Email Report (`app/(protected)/dashboard/emailReport.ts`)

Triggered from Dashboard; exports an `.eml` file (RFC 822) openable in any mail client.

**Sections in order:** P&L monthly table → Pending Trades (grouped by value_date) → P&L donuts (booking entity + txn type) → Clients P&L → Volumes by Client → Volumes by Issuer → Number of Trades by Issuer.

**Chart rendering:** SVG built in-process, converted to base64 PNG via Canvas 2D (`svgToPngDataUrl`) for email client compatibility. `buildStackedBarsSvg(data, currencies, labelKey)` is generic — pass `"issuer"` or `"client"` as `labelKey`.

**Leg badge logic:** `trade_legs.leg` is dealer-perspective → dealer `'buy'` = counterparty is **seller** (S badge); dealer `'sell'` = counterparty is **buyer** (B badge).

**Pending trades filter:** respects active Sales filter — if a specific sales person is selected, the query adds `.eq('sales_name', sales)`.

**Colour constants:**
- CCY: CHF `#1f3a8a`, EUR `#005F9B`, USD `#9ca3af`
- Entity gradient: `#002651` → `#C5D8F0`
- Txn types: Primary `#002651`, Increase `#005F9B`, Unwind `#405363`

### MiFID 2 Report (`app/(protected)/transaction-reporting/`)

- Excel generated server-side via `ExcelJS` from template `app/(protected)/transaction-reporting/RiverRock.MiFIR.template.xlsx`
- **ARM status preservation:** before inserting new `mifid_report_trades` rows, query existing confirmed statuses and carry them forward — never revert `'confirmed'` to `'pending'` on regeneration
- Settlement type affects net amount: `'percent'` → divide price by 100; `'units'` → multiply directly
- Reference field appends letter suffix (A, B, …) for trades with multiple counterparty pairs

## Conventions

- Colour palette: Dark navy `#1A2A4A` | Accent blue `#2E5FA3` | Light fill `#EBF0F8`
- All data from Supabase — no hardcoded mock data
- TypeScript interfaces for all data shapes
- `@/` alias resolves from project root
- SQL migrations live in `supabase/` — applied manually via Supabase SQL editor
- After schema changes, run `NOTIFY pgrst, 'reload schema';` to refresh PostgREST cache
- `entity_type` on `group_entities` is the canonical way to identify Valeur vs RiverRock — never match on `legal_name` strings
- Worktrees live under `.claude/worktrees/<name>/`; each needs its own `.env.local` (copy from repo root)
