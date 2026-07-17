# MRP mismatch upgrade — USP_WMS_DASHBOARD_V3 v3.4 (17/07/2026)

Adds PO-MRP vs WMS-label-MRP mismatch reporting to the dashboard proc
(requested by mail 17/07/2026; rule mirrors FLAG=0 in
USP_IMP_WMS_GET_CLIENTPO_DOWNLOADEXCEL — PO MRP string not found inside the
comma-joined label prices for that EAN; an EAN with no printed label at all
therefore also counts as a mismatch).

Changes (append-only, rs[0]..rs[24] indexing unchanged):
- STEP 11: #MRP_MM temp table — one row per PONO+EAN mismatch
- RS12 PO tracking: + MRP_MISMATCH_COUNT
- RS21 range KPI: + MRP_MISMATCH_EAN_COUNT, MRP_MISMATCH_PO_COUNT
- RS22 STR tracking: + MRP_MISMATCH_COUNT
- RS26 (new, rs[25]): mismatch detail — PONO, Vendor Article Code, SKU, EAN,
  Item Name, PO MRP, WMS Label MRP, Balance Qty

The received draft had two syntax errors, fixed here: the proc header was in
script-debug form (`DECLARE` active, `AS` commented) and RS26 used a double
column alias (`ITEMNAME = ... AS [Item Name]`).

Files:
- `USP_WMS_DASHBOARD_V3.live_backup_20260717.sql` — pre-change live definition
- `USP_WMS_DASHBOARD_V3.v3_4_mrp_mismatch.sql` — deployed v3.4 definition
- `apply_mrp_mismatch.js` — backup (in-DB: USP_WMS_DASHBOARD_V3_BKUP_20260717)
  + ALTER + smoke run. Executed 17/07/2026: 26 recordsets OK, 3140 mismatch
  EANs / 138 POs / 6804 detail rows at deploy time.
- `revert_mrp_mismatch.js` — restore the pre-v3.4 definition from the backup

Run from the repo root (`node scripts/mrp-mismatch/apply_mrp_mismatch.js`) so
`mssql` resolves.
