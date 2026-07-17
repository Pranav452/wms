@AGENTS.md

# Working branch
Always work directly on the `main` branch. Do NOT create worktrees or feature branches unless explicitly asked. Commit directly to main.

# Project
Next.js 15 App Router WMS dashboard for Seaport Logistics Mumbai.
- DB: MSSQL at 180.179.207.163, SP: USP_WMS_DASHBOARD_V3
- All pages under app/(dashboard)/
- Context: DashboardContext fetches all data once via /api/dashboard

<!-- second-brain spoke (auto-added 2026-07-14) -->
## Project context (second brain)

Next.js dashboard 'bridge-wms' for Seaport Logistics Mumbai — warehouse stock, racks, containers, dispatch, GRN, PO, MRP, RTV from an ERP MSSQL database.
Stack: Next.js 16 (App Router), React 19, TS, Tailwind 4, mssql, recharts, xlsx, lenis, lucide-react.
Run: npm run dev → :3000. Data via stored proc USP_WMS_DASHBOARD_V3 on MSSQL 180.179.207.163.
Watch out: .env.local has LIVE prod DB creds (user jolly_a, plaintext pw) — never commit/print. Convention: commit directly to main, no feature branches. CLAUDE.md warns this Next.js version breaks vs training data — check node_modules/next/dist/docs. scripts/ are one-off prod stockfix scripts, not reusable.

Cross-project brain: `C:\Users\Manilal\second-brain` — full card `notes/projects/wms.md`, recent context `hot.md`. Read the brain for cross-project/domain knowledge; do NOT read it for general coding questions.
