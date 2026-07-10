/* ============================================================================
   ONE-TIME REPAIR: reset currentstock / balancestock to the computed balance
   ----------------------------------------------------------------------------
   !! DO NOT RUN WITHOUT EXPLICIT SIGN-OFF. Run 06_preview_drift.sql first
   !! and deploy the SP fixes (01–05) BEFORE this, or new vouchers will
   !! immediately re-corrupt the repaired rows.

   Sets, for every row of WMS_ITEM_STOCK_MASTER_COMMON_CONTR:
       CURRENTSTOCK = BALANCESTOCK = GRN − issued + returned
   per (FK_ITEMID, CONTAINERNO), GRN container from TBL_IMP_WMS_GRN_MASTER —
   the same arithmetic as USP_WMS_RECONCILE_FULL_STOCK and the wms dashboard.
   Then rolls item totals up into WMS_ITEM_STOCK_MASTER.

   Equivalent alternative: EXEC USP_WMS_RECONCILE_FULL_STOCK (verified
   correct). This standalone version prints before/after row counts and keeps
   an audit copy of the changed rows in WMS_STOCKFIX_AUDIT_20260710.

   NOTE: includes returns of ALL FK_RETURNREASON values (matches the
   reconcile SP and the dashboard). The insert SPs only re-stock reason=1;
   208 detail rows / 217 units carry reason=0 today. If reason-0 returns must
   NOT count as stock, add "WHERE FK_RETURNREASON = 1" to the RTN CTE here,
   in USP_WMS_RECONCILE_FULL_STOCK, and in the dashboard query.
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @RC INT;

BEGIN TRY
    BEGIN TRAN;

    /* ---------- audit copy of rows about to change ---------- */
    ;WITH GRN AS (
        SELECT D.FK_ITEMID, M.CONTAINERNO, QTY = SUM(D.QTY)
        FROM TBL_IMP_WMS_GRN_DTLS D
        INNER JOIN TBL_IMP_WMS_GRN_MASTER M ON M.GRNNO = D.GRNNO
        GROUP BY D.FK_ITEMID, M.CONTAINERNO),
    ISS AS (
        SELECT FK_ITEMID, CONTAINERNO, QTY = SUM(ISSUEQTY)
        FROM TBL_IMP_WMS_GOODSISSUE_DTLS
        GROUP BY FK_ITEMID, CONTAINERNO),
    RTN AS (
        SELECT FK_ITEMID, CONTAINERNO, QTY = SUM(RETURNQTY)
        FROM TBL_IMP_WMS_GOODSRETURN_DTLS
        GROUP BY FK_ITEMID, CONTAINERNO)
    SELECT S.FK_ITEMID, S.containerno, S.EAN,
           OLD_CURRENTSTOCK = S.CURRENTSTOCK,
           OLD_BALANCESTOCK = S.BALANCESTOCK,
           NEWSTOCK = ISNULL(G.QTY,0) - ISNULL(I.QTY,0) + ISNULL(R.QTY,0),
           FIXED_AT = GETDATE()
    INTO WMS_STOCKFIX_AUDIT_20260710
    FROM WMS_ITEM_STOCK_MASTER_COMMON_CONTR S
    LEFT JOIN GRN G ON G.FK_ITEMID = S.FK_ITEMID AND G.CONTAINERNO = S.containerno
    LEFT JOIN ISS I ON I.FK_ITEMID = S.FK_ITEMID AND I.CONTAINERNO = S.containerno
    LEFT JOIN RTN R ON R.FK_ITEMID = S.FK_ITEMID AND R.CONTAINERNO = S.containerno
    WHERE ISNULL(S.CURRENTSTOCK,0) <> ISNULL(G.QTY,0) - ISNULL(I.QTY,0) + ISNULL(R.QTY,0)
       OR ISNULL(S.BALANCESTOCK,0) <> ISNULL(G.QTY,0) - ISNULL(I.QTY,0) + ISNULL(R.QTY,0);

    SET @RC = @@ROWCOUNT; PRINT 'Audit rows captured: ' + CONVERT(VARCHAR(12), @RC);

    /* ---------- step 1: container-level reset ---------- */
    ;WITH GRN AS (
        SELECT D.FK_ITEMID, M.CONTAINERNO, QTY = SUM(D.QTY)
        FROM TBL_IMP_WMS_GRN_DTLS D
        INNER JOIN TBL_IMP_WMS_GRN_MASTER M ON M.GRNNO = D.GRNNO
        GROUP BY D.FK_ITEMID, M.CONTAINERNO),
    ISS AS (
        SELECT FK_ITEMID, CONTAINERNO, QTY = SUM(ISSUEQTY)
        FROM TBL_IMP_WMS_GOODSISSUE_DTLS
        GROUP BY FK_ITEMID, CONTAINERNO),
    RTN AS (
        SELECT FK_ITEMID, CONTAINERNO, QTY = SUM(RETURNQTY)
        FROM TBL_IMP_WMS_GOODSRETURN_DTLS
        GROUP BY FK_ITEMID, CONTAINERNO),
    CALC AS (
        SELECT S.FK_ITEMID, S.containerno,
               NEWSTOCK = ISNULL(G.QTY,0) - ISNULL(I.QTY,0) + ISNULL(R.QTY,0)
        FROM WMS_ITEM_STOCK_MASTER_COMMON_CONTR S
        LEFT JOIN GRN G ON G.FK_ITEMID = S.FK_ITEMID AND G.CONTAINERNO = S.containerno
        LEFT JOIN ISS I ON I.FK_ITEMID = S.FK_ITEMID AND I.CONTAINERNO = S.containerno
        LEFT JOIN RTN R ON R.FK_ITEMID = S.FK_ITEMID AND R.CONTAINERNO = S.containerno)
    UPDATE S
    SET S.CURRENTSTOCK = C.NEWSTOCK,
        S.BALANCESTOCK = C.NEWSTOCK
    FROM WMS_ITEM_STOCK_MASTER_COMMON_CONTR S
    INNER JOIN CALC C ON C.FK_ITEMID = S.FK_ITEMID AND C.containerno = S.containerno
    WHERE ISNULL(S.CURRENTSTOCK,0) <> C.NEWSTOCK
       OR ISNULL(S.BALANCESTOCK,0) <> C.NEWSTOCK;

    SET @RC = @@ROWCOUNT; PRINT 'Container-level rows fixed: ' + CONVERT(VARCHAR(12), @RC);

    /* ---------- step 2: roll item totals up into WMS_ITEM_STOCK_MASTER ---------- */
    ;WITH CONTAINER_SUM AS (
        SELECT FK_ITEMID, STOCK = SUM(CURRENTSTOCK)
        FROM WMS_ITEM_STOCK_MASTER_COMMON_CONTR
        GROUP BY FK_ITEMID)
    UPDATE M
    SET M.CURRENTSTOCK = ISNULL(CS.STOCK, 0),
        M.BALANCESTOCK = ISNULL(CS.STOCK, 0)
    FROM WMS_ITEM_STOCK_MASTER M
    LEFT JOIN CONTAINER_SUM CS ON CS.FK_ITEMID = M.FK_ITEMID
    WHERE ISNULL(M.CURRENTSTOCK,0) <> ISNULL(CS.STOCK,0)
       OR ISNULL(M.BALANCESTOCK,0) <> ISNULL(CS.STOCK,0);

    SET @RC = @@ROWCOUNT; PRINT 'Item-level rows fixed: ' + CONVERT(VARCHAR(12), @RC);

    COMMIT TRAN;
    PRINT 'REPAIR COMMITTED';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRAN;
    PRINT 'REPAIR FAILED, ROLLED BACK: ' + ERROR_MESSAGE();
END CATCH
