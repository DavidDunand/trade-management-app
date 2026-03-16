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
**Deployed:** Vercel (auto-deploy from `main`). Work on `dev` branch, merge to `main` to deploy.
**Live URL:** https://valeur-europe-postrade.vercel.app

### Route structure

All authenticated pages live under `app/(protected)/` with a shared sidebar layout (`layout.tsx`). Auth is enforced client-side in that layout — no `middleware.ts`. The layout checks `supabase.auth.getSession()` on mount, fetches `profiles.active`, and redirects to `/login` if unauthenticated or inactive.

Menu items marked `adminOnly: true` are hidden from `readonly` role users.

### Supabase — two client patterns

| Where | Key used | Import |
|---|---|---|
| Client components (`"use client"`) | Anon key | `import { supabase } from "@/src/lib/supabase"` |
| API routes | Service role key (bypasses RLS) | Created inline in route file |

API routes always set `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`. File download responses use `new NextResponse(new Uint8Array(buffer), { headers })`.

### Key database tables

- `trades` — core trade record; booked/cancelled trades are locked by trigger `prevent_update_delete_booked()` (only pending trades can be deleted; booked trades can only be cancelled)
- `trade_legs` — buy/sell legs per trade (`leg: 'buy'|'sell'` from dealer perspective)
- `products`, `issuers`, `counterparties`, `advisors` (clients), `contacts`, `profiles`
- `group_entities` — booking/distributing entities (Valeur, RiverRock); has `entity_type` column (`'valeur'|'riverrock'|'other'`) used for template selection — do NOT use legal name string matching
- `counterparty_contacts`, `advisor_contacts`, `group_entity_contacts` — contacts per entity type
- `fx_rates` — refreshed by Supabase cron (`fx-refresh-ecb`); `get_fx_health()` DB function drives the FX status widget

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

Receivables filtered by `group_entities.entity_type = 'riverrock'` (fetched at load, stored in `riverrockEntityName` state). Internal counterparty for billing fetched by `cp_type = 'internal'` only — no name filter.

## Conventions

- Colour palette: Dark navy `#1A2A4A` | Accent blue `#2E5FA3` | Light fill `#EBF0F8`
- All data from Supabase — no hardcoded mock data
- TypeScript interfaces for all data shapes
- `@/` alias resolves from project root
- SQL migrations live in `supabase/` — applied manually via Supabase SQL editor
- After schema changes, run `NOTIFY pgrst, 'reload schema';` to refresh PostgREST cache
