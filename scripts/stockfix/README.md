# currentstock drift — root cause + fix scripts

> **EXECUTED IN PRODUCTION 2026-07-10 ~17:45 IST.** Steps run, in order:
> full backups (`WMS_ITEM_STOCK_MASTER_COMMON_CONTR_BKUP_20260710_PRE_STOCKFIX`
> 35,051 rows; `WMS_ITEM_STOCK_MASTER_BKUP_20260710_PRE_STOCKFIX` 32,655 rows;
> original SP definitions in `original_sps_backup_20260710/`), then SP fixes
> `01`–`05`, then repair `07` (779 container rows + 189 item rows fixed, audit
> in `WMS_STOCKFIX_AUDIT_20260710`). Post-check: all 35,051 rows drift-free;
> stored total = computed total = 72,439; EAN 3616035872832 back to 20.
> **Revert path: `08_revert_stockfix.sql`** (data) + the saved original SP
> definitions (procedures).

`WMS_ITEM_STOCK_MASTER_COMMON_CONTR.currentstock` disagrees with the
authoritative balance (GRN − issued + returned per EAN+container) on ~780 of
35k rows: 700 overstated (+5,207 units), 79 understated (−401 units) as of
2026-07-10. The wms dashboard already computes its own balance; this fix is
for the ERP side.

## Root causes (all proven against production data)

### 1. Goods-return SPs multiply returns by the item's container count → OVERSTATEMENT

`USP_IMP_WMS_GOODSRETURN_INSERT_DTLS` and `USP_IMP_WMS_GOODSRETURN_BULKINSERT_CSV`
join the stock table *inside* the `SUM()` subquery on `FK_ITEMID` only — no
container condition:

```sql
(SELECT RETURNQTY=SUM(DTLS.RETURNQTY), DTLS.FK_ITEMID, DTLS.CONTAINERNO
 FROM TBL_IMP_WMS_GOODSRETURN_DTLS DTLS
 INNER JOIN WMS_ITEM_MASTER ITEMMST ON ITEMMST.PK_ITEMID=DTLS.FK_ITEMID
 INNER JOIN WMS_ITEM_STOCK_MASTER_COMMON_CONTR STOCK
        ON ITEMMST.PK_ITEMID=STOCK.FK_ITEMID   -- ← no CONTAINERNO match!
 ...)
```

An item stocked in N containers matches N stock rows, so `SUM(RETURNQTY)` is
multiplied by N before being added. The goods-issue SP has the container
condition (`STOCK.containerno=DTLS.containerno`); the return SPs dropped it.

Evidence: 521 of the 700 overstated rows have returns on multi-container
items; 383 have drift that is an exact multiple of their returned qty. Top
rows match `returned × (N−1)` exactly: EAN 3492216322385 drift 108 = 36×3
(N=4), EAN 3492217106809 drift 87 = 29×3, the reported example
3616035872832/TRHU4806138 drift includes 20×1 from its single 20-unit return
(N=2). Residual differences on a few rows come from stacked edit cycles where
N changed between saves.

### 2. GRN SPs silently skip stock credits on NULL item-group → UNDERSTATEMENT

`USP_IMP_WMS_GRN_INSERT_DTLS` (+ `_MANUAL`) credit stock through a subquery
filtered by:

```sql
AND DTLS.FK_ITEMGRPID = ITEMMST.FK_ITEMGRPID
AND DTLS.ITEMSIZE     = ITEMMST.SIZE
```

`FK_ITEMGRPID` is NULL on many GRN detail rows *and* item-master rows;
`NULL = NULL` is UNKNOWN, so the whole GRN line is silently never credited.
Evidence: every container-CAAU7583275 stock row has received GRN qty, zero
issues, `currentstock = 0` (item grp NULL on both sides). Explains the 79
understated rows (e.g. item 15675: GRN 24 in two vouchers — the older one has
grp 2 vs master NULL, the newer NULL vs NULL — neither credited; 12 were then
issued against clamped-at-zero stock).

Two more defects in the same SPs:

- Stock blocks have **no SUM/GROUP BY**; `UPDATE ... FROM` applies only ONE
  arbitrary row per target when the derived table holds several rows for the
  same item, so multi-line GRNs part-credit.
- Reverse-out blocks clamp with `CASE WHEN CURRENTSTOCK > 0 ... ELSE 0 END`,
  so once stock touches 0 an edit/delete can no longer restore it (same clamp
  exists throughout `USP_IMP_WMS_GOODSISSUE_INSERT_DTLS`).

### 3. `USP_WMS_RECONCILE_FULL_STOCK` — arithmetic is CORRECT

Its GRN/ISS/RET math matches the authoritative method. The drift exists
because it isn't being run (and if it were run on a schedule, the broken
insert SPs would re-corrupt rows between runs anyway). One nuance: it counts
returns of **all** `FK_RETURNREASON` values while the insert SPs only
re-stock reason=1 (208 rows / 217 units currently carry reason=0). Decide
which semantics is right and align all three places (reconcile SP, insert
SPs, dashboard query) — the scripts here keep the reconcile/dashboard
convention (all reasons) for the repair, and the insert-SP convention
(reason=1) inside the return SPs, i.e. exactly the behaviour each had before.

## Files

| # | file | what it does |
|---|------|--------------|
| 01 | `01_fix_USP_IMP_WMS_GOODSRETURN_INSERT_DTLS.sql` | container-matched, aggregated return posting |
| 02 | `02_fix_USP_IMP_WMS_GOODSRETURN_BULKINSERT_CSV.sql` | same fix for the KIABI CSV bulk path |
| 03 | `03_fix_USP_IMP_WMS_GOODSISSUE_INSERT_DTLS.sql` | removes `CASE WHEN > 0` clamps; aggregates the delete-reversal |
| 04 | `04_fix_USP_IMP_WMS_GRN_INSERT_DTLS.sql` | drops NULL-unsafe grp/size joins; SUM+GROUP BY; no clamps |
| 05 | `05_fix_USP_IMP_WMS_GRN_INSERT_DTLS_MANUAL.sql` | same for the manual-GRN clone |
| 06 | `06_preview_drift.sql` | read-only: summary, affected rows, missing stock rows |
| 07 | `07_repair_currentstock.sql` | one-time reset to computed balance, with audit table |

## Run order (production, after sign-off)

1. Run `06_preview_drift.sql`, keep the output.
2. Deploy `01`–`05` (ALTER PROCEDURE, idle moment — each is atomic).
3. Run `07_repair_currentstock.sql` (transaction; writes audit copy to
   `WMS_STOCKFIX_AUDIT_20260710`). Alternative: `EXEC USP_WMS_RECONCILE_FULL_STOCK`
   — same arithmetic, no audit table.
4. Re-run `06` — OVERSTATED/UNDERSTATED buckets must be empty.
5. Optional: schedule `USP_WMS_RECONCILE_FULL_STOCK` (e.g. nightly) as a
   safety net.

## Known leftovers (out of scope, decide separately)

- **319 (item, container) combos** have GRN/issue/return flows but no row in
  `WMS_ITEM_STOCK_MASTER_COMMON_CONTR` at all (query 3 of the preview lists
  them). The repair doesn't invent rows; if ERP screens need them, they must
  be inserted with the full column set (rack, cmp/city, item attributes).
- The reason-0 returns question above (217 units).
- `WMS_ITEM_MASTER_UPLOAD` / `_MRPLABEL.BALQTY` share some of the same join
  defects; only the NULL-unsafe join in the UPLOAD block of the GRN SPs was
  fixed. Full BALQTY audit not done.
