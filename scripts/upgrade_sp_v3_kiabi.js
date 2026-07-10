// Merges USP_WMS_KIABI_REPORTS into USP_WMS_DASHBOARD_V3 (v3.2):
//   - backs up the live V3 as USP_WMS_DASHBOARD_V3_BKUP_20260710 first
//     (revert = drop V3, rename/recreate from the backup definition)
//   - adds @FROMDATE VARCHAR(10) = '' (optional -> existing 3-param callers keep working)
//   - flow recordsets gain the range lower bound (RS6 trend, RS8 daily dispatch,
//     RS10 client dispatch, RS15 MRP daily, RS18 delivery agents, RS19 GRN daily);
//     stock recordsets stay as-on @ASONDATE per the agreed semantics
//   - appends RS21-RS25: RANGE KPI, STR TRACKING, RTV SUMMARY, RTV EAN DETAIL, DAILY FLOW
//
// Recordset order 1-20 is unchanged, so rs[0]..rs[19] indexing in
// app/api/dashboard/route.ts stays valid; new sets are rs[20]..rs[24].

const sql = require('mssql');
const cfg = {
  server: '180.179.207.163', port: 1433,
  user: 'jolly_a', password: 'Mpprod51', database: 'manilal',
  options: { trustServerCertificate: true, encrypt: false },
  requestTimeout: 300000,
};

const BACKUP = 'USP_WMS_DASHBOARD_V3_BKUP_20260710';

const NEW_DEF = `
ALTER PROCEDURE [dbo].[USP_WMS_DASHBOARD_V3]

--DECLARE
    @CMPCODE  VARCHAR(2)  = '01',
    @CITYCODE VARCHAR(3)  = 'MUM',
    @ASONDATE VARCHAR(10),          -- dd/MM/yyyy  (as-on / end of window)
    @FROMDATE VARCHAR(10) = ''      -- dd/MM/yyyy, '' = open start (all-time)

AS/*

    SET @CMPCODE  = '01'
    SET @CITYCODE = 'MUM'
    SET @ASONDATE = convert(varchar,getdate(),103)
    SET @FROMDATE = ''

--*/

/*
  USP_WMS_DASHBOARD_V3  -  WMS Stock-Status Dashboard (25 result sets)
  v3.3: with @FROMDATE set, RS3 stock rows limit to EANs with receipt/issue/
    return activity in the window and RS13 limits to containers with receipts
    in the window (qty columns stay as-on lifetime values).
  v3.2 (KIABI mail 09/07/2026):
    - @FROMDATE optional range start; flow recordsets (RS6, RS8, RS10, RS15,
      RS18, RS19) filter to the window, stock recordsets stay as-on @ASONDATE
    - RS12 carries STR_CREATION_DATE (client PO CSV upload date via LOGID)
    - RS21 RANGE KPI, RS22 STR TRACKING (+dispatch TAT), RS23 RTV SUMMARY,
      RS24 RTV EAN DETAIL, RS25 DAILY FLOW appended
    - backup of the previous version: ${BACKUP}
  Fixes (v3.1):
    - #RETURN now filters ISNULL(FK_RETURNREASON,0)=1  (matches original USP_WMS_DASHBOARD)
    - RS12 PO Tracking: dispatched calculated via ACKNO=PONO (not EAN join)
    - RS11 PO vs Dispatch: joined on CLIENT code (not EAN)
*/

BEGIN
    SET NOCOUNT ON;

    DECLARE @TDATE DATETIME;
    SET @TDATE = CONVERT(DATETIME, @ASONDATE, 103);

    DECLARE @FDATE DATETIME;
    SET @FDATE = CASE WHEN ISNULL(@FROMDATE,'') = '' THEN NULL
                      ELSE CONVERT(DATETIME, @FROMDATE, 103) END;

    -- inclusive end-of-day bound for datetime columns
    DECLARE @TEOD DATETIME;
    SET @TEOD = DATEADD(SECOND, -1, DATEADD(DAY, 1, @TDATE));

    /* ── STEP 1: GRN receipts ── */
    IF OBJECT_ID('tempdb..#GRN') IS NOT NULL DROP TABLE #GRN;
    SELECT M.GRNNO, M.CONTAINERNO, M.SHIPMENTTYPE,
           GRNDATE = CONVERT(DATETIME, M.GRNDATE, 103),
           D.EAN, RECEIPT_QTY = D.QTY
    INTO #GRN
    FROM TBL_IMP_WMS_GRN_MASTER M
    INNER JOIN TBL_IMP_WMS_GRN_DTLS D ON D.FK_GRNMSTID = M.ID
    WHERE M.CITYCODE = @CITYCODE
      AND CONVERT(DATETIME, M.GRNDATE, 103) <= @TDATE;
    CREATE NONCLUSTERED INDEX IX_GRN_EAN  ON #GRN (EAN);
    CREATE NONCLUSTERED INDEX IX_GRN_CONT ON #GRN (CONTAINERNO);

    /* ── STEP 2: Issues by EAN (aggregated by EAN only — no container join) ── */
    IF OBJECT_ID('tempdb..#ISSUE') IS NOT NULL DROP TABLE #ISSUE;
    SELECT D.EAN, ISSUE_QTY = SUM(D.ISSUEQTY)
    INTO #ISSUE
    FROM tbl_imp_wms_goodsissue_dtls D
    INNER JOIN tbl_imp_wms_goodsissue_mst M ON M.GINNO = D.FK_GINNO
    WHERE M.CITYCODE = @CITYCODE AND M.ISSUEDATE <= @TDATE
    GROUP BY D.EAN;
    CREATE NONCLUSTERED INDEX IX_ISSUE_EAN ON #ISSUE (EAN);

    /* ── STEP 3: Returns by EAN — FK_RETURNREASON=1 only (matches original SP) ── */
    IF OBJECT_ID('tempdb..#RETURN') IS NOT NULL DROP TABLE #RETURN;
    SELECT D.EAN, RETURN_QTY = SUM(D.RETURNQTY)
    INTO #RETURN
    FROM TBL_IMP_WMS_GOODSRETURN_DTLS D
    INNER JOIN TBL_IMP_WMS_GOODSRETURN_MST M ON M.GRTNNO = D.FK_GRTNNO
    WHERE M.CITYCODE = @CITYCODE
      AND CONVERT(DATETIME, M.GRTNDATE, 103) <= @TDATE
      AND ISNULL(D.FK_RETURNREASON, 0) = 1
    GROUP BY D.EAN;
    CREATE NONCLUSTERED INDEX IX_RETURN_EAN ON #RETURN (EAN);

    /* ── STEP 4: EAN-level stock ── */
    IF OBJECT_ID('tempdb..#STOCK') IS NOT NULL DROP TABLE #STOCK;
    SELECT G.EAN,
        RECEIPT_QTY = SUM(G.RECEIPT_QTY),
        ISSUE_QTY   = ISNULL(MAX(I.ISSUE_QTY),  0),
        RETURN_QTY  = ISNULL(MAX(R.RETURN_QTY), 0),
        BAL_QTY     = SUM(G.RECEIPT_QTY) - ISNULL(MAX(I.ISSUE_QTY), 0) + ISNULL(MAX(R.RETURN_QTY), 0),
        OLDEST_GRN  = MIN(G.GRNDATE),
        AGING_DAYS  = DATEDIFF(DAY, MIN(G.GRNDATE), @TDATE)
    INTO #STOCK
    FROM #GRN G
    LEFT JOIN #ISSUE  I ON I.EAN = G.EAN
    LEFT JOIN #RETURN R ON R.EAN = G.EAN
    GROUP BY G.EAN;
    CREATE NONCLUSTERED INDEX IX_STOCK_EAN ON #STOCK (EAN);

    /* ── STEP 5: PO by EAN ── */
    IF OBJECT_ID('tempdb..#PO') IS NOT NULL DROP TABLE #PO;
    SELECT GTIN AS EAN, PO_QTY = SUM(CONVERT(INT, QTY))
    INTO #PO FROM TBL_WMS_CLIENTPO GROUP BY GTIN;
    CREATE NONCLUSTERED INDEX IX_PO_EAN ON #PO (EAN);

    /* ── STEP 6: Dispatched by PONO via ACKNO (fix for RS12) ── */
    IF OBJECT_ID('tempdb..#PO_DISPATCHED') IS NOT NULL DROP TABLE #PO_DISPATCHED;
    SELECT GM.ACKNO AS PONO,
           DISPATCHED_QTY    = SUM(GD.ISSUEQTY),
           LAST_DISPATCH_DATE = CONVERT(VARCHAR(10), MAX(GM.ISSUEDATE), 103)
    INTO #PO_DISPATCHED
    FROM tbl_imp_wms_goodsissue_mst GM
    JOIN tbl_imp_wms_goodsissue_dtls GD ON GD.FK_GINNO = GM.GINNO
    WHERE GM.CITYCODE = @CITYCODE
      AND GM.ISSUEDATE <= @TDATE
      AND ISNULL(LTRIM(RTRIM(GM.ACKNO)), '') != ''
    GROUP BY GM.ACKNO;
    CREATE NONCLUSTERED INDEX IX_PODISP_PONO ON #PO_DISPATCHED (PONO);

    /* ── STEP 7: STR creation date per PONO (upload log via LOGID) ── */
    IF OBJECT_ID('tempdb..#STRD') IS NOT NULL DROP TABLE #STRD;
    SELECT PO.PONO, STR_DT = MIN(L.MAKERDT)
    INTO #STRD
    FROM (SELECT DISTINCT PONO, LOGID FROM TBL_WMS_CLIENTPO) PO
    LEFT JOIN TBL_IMP_WMS_CLIENTPO_UPLOAD_CSV_LOG L ON L.PK_ID = PO.LOGID
    GROUP BY PO.PONO;

    /* ── STEP 8: range-aware dispatch aggregates per PONO ── */
    IF OBJECT_ID('tempdb..#DISP') IS NOT NULL DROP TABLE #DISP;
    SELECT GM.ACKNO AS PONO,
        DISP_TOTAL = SUM(CASE WHEN GM.ISSUEDATE <= @TEOD THEN GD.ISSUEQTY ELSE 0 END),
        DISP_RANGE = SUM(CASE WHEN GM.ISSUEDATE <= @TEOD
                               AND (@FDATE IS NULL OR GM.ISSUEDATE >= @FDATE)
                              THEN GD.ISSUEQTY ELSE 0 END),
        FIRST_DISP = MIN(GM.ISSUEDATE),
        LAST_DISP  = MAX(CASE WHEN GM.ISSUEDATE <= @TEOD THEN GM.ISSUEDATE END)
    INTO #DISP
    FROM tbl_imp_wms_goodsissue_mst GM
    JOIN tbl_imp_wms_goodsissue_dtls GD ON GD.FK_GINNO = GM.GINNO
    WHERE GM.CITYCODE = @CITYCODE
      AND ISNULL(LTRIM(RTRIM(GM.ACKNO)), '') != ''
    GROUP BY GM.ACKNO;

    /* ── STEP 9: returns in window (note level) ── */
    IF OBJECT_ID('tempdb..#RTV') IS NOT NULL DROP TABLE #RTV;
    SELECT M.GRTNNO, M.RETURNNO, M.CLIENTINVNO, M.CLIENT, M.SCANTYPE,
        RECV_DT  = ISNULL(M.RETURNDATE, CONVERT(DATETIME, M.GRTNDATE, 103)),
        ENTRY_DT = M.MAKERDT
    INTO #RTV
    FROM tbl_imp_wms_goodsreturn_mst M
    WHERE M.CMPCODE = @CMPCODE AND M.CITYCODE = @CITYCODE
      AND ISNULL(M.RETURNDATE, CONVERT(DATETIME, M.GRTNDATE, 103)) <= @TEOD
      AND (@FDATE IS NULL OR ISNULL(M.RETURNDATE, CONVERT(DATETIME, M.GRTNDATE, 103)) >= @FDATE);

    /* ── STEP 10: EANs with activity in the window (range row-filter) ── */
    IF OBJECT_ID('tempdb..#WEAN') IS NOT NULL DROP TABLE #WEAN;
    CREATE TABLE #WEAN (EAN VARCHAR(16) PRIMARY KEY);
    IF @FDATE IS NOT NULL
        INSERT INTO #WEAN
        SELECT DISTINCT X.EAN FROM (
            SELECT G.EAN FROM #GRN G WHERE G.GRNDATE >= @FDATE
            UNION ALL
            SELECT GD.EAN
            FROM tbl_imp_wms_goodsissue_mst GM
            JOIN tbl_imp_wms_goodsissue_dtls GD ON GD.FK_GINNO = GM.GINNO
            WHERE GM.CITYCODE = @CITYCODE
              AND GM.ISSUEDATE >= @FDATE AND GM.ISSUEDATE <= @TEOD
            UNION ALL
            SELECT D.EAN
            FROM #RTV R
            JOIN tbl_imp_wms_goodsreturn_dtls D ON D.FK_GRTNNO = R.GRTNNO
        ) X
        WHERE X.EAN IS NOT NULL;

    /* ════════════════════════════════════════════════════════════
       RS1 : KPI SUMMARY
    ════════════════════════════════════════════════════════════ */
    SELECT
        SUM(RECEIPT_QTY)  AS RECEIPT_QTY,
        SUM(ISSUE_QTY)    AS ISSUE_QTY,
        SUM(RETURN_QTY)   AS RETURN_QTY,
        SUM(BAL_QTY)      AS BAL_QTY,
        (SELECT SUM(PO_QTY) FROM #PO) AS PO_QTY,
        (SELECT SUM(PO_QTY) FROM #PO) - SUM(ISSUE_QTY) AS UNFULFILLED_PO_QTY,
        (SELECT COUNT(DISTINCT CONTAINERNO) FROM #GRN) AS CONTAINER_COUNT,
        COUNT(DISTINCT EAN) AS SKU_COUNT,
        SUM(CASE WHEN AGING_DAYS > 90 THEN BAL_QTY ELSE 0 END) AS AGING_90_PLUS,
        (SELECT SUM(RecptQty) FROM tbl_imp_wms_mrplableprint_assignuser WHERE CompletedOn IS NOT NULL) AS MRP_DONE_QTY,
        (SELECT SUM(RecptQty) FROM tbl_imp_wms_mrplableprint_assignuser WHERE CompletedOn IS NULL)     AS MRP_PENDING_QTY
    FROM #STOCK;

    /* ════════════════════════════════════════════════════════════
       RS2 : SHIPMENT TYPE SUMMARY
    ════════════════════════════════════════════════════════════ */
    SELECT G.SHIPMENTTYPE,
        CONTAINER_COUNT = COUNT(DISTINCT G.CONTAINERNO),
        SKU_COUNT       = COUNT(DISTINCT G.EAN),
        RECEIPT_QTY     = SUM(G.RECEIPT_QTY),
        BAL_QTY         = SUM(S.BAL_QTY)
    FROM #GRN G
    INNER JOIN #STOCK S ON S.EAN = G.EAN
    GROUP BY G.SHIPMENTTYPE;

    /* ════════════════════════════════════════════════════════════
       RS3 : STOCK BY EAN/SKU
       With a range: only EANs that had receipt/issue/return activity
       in the window (qty columns remain lifetime as-on values).
    ════════════════════════════════════════════════════════════ */
    SELECT
        SRNO       = ROW_NUMBER() OVER (ORDER BY S.EAN),
        S.EAN,
        S.RECEIPT_QTY, S.ISSUE_QTY, S.RETURN_QTY, S.BAL_QTY,
        PO_QTY     = ISNULL(P.PO_QTY, 0),
        OLDEST_GRN = CONVERT(VARCHAR(10), S.OLDEST_GRN, 103),
        S.AGING_DAYS
    FROM #STOCK S LEFT JOIN #PO P ON P.EAN = S.EAN
    WHERE (@FDATE IS NULL OR S.EAN IN (SELECT EAN FROM #WEAN));

    /* ════════════════════════════════════════════════════════════
       RS4 : AGING BUCKETS
    ════════════════════════════════════════════════════════════ */
    SELECT
        BUCKET = CASE WHEN AGING_DAYS<=30 THEN '0-30' WHEN AGING_DAYS<=60 THEN '31-60'
                      WHEN AGING_DAYS<=90 THEN '61-90' ELSE '90+' END,
        CNT = COUNT(*), BAL_QTY = SUM(BAL_QTY)
    FROM #STOCK
    GROUP BY CASE WHEN AGING_DAYS<=30 THEN '0-30' WHEN AGING_DAYS<=60 THEN '31-60'
                  WHEN AGING_DAYS<=90 THEN '61-90' ELSE '90+' END;

    /* ════════════════════════════════════════════════════════════
       RS5 : MRP PENDING DETAIL
    ════════════════════════════════════════════════════════════ */
    SELECT EAN, PENDING_QTY = SUM(RECPTQTY)
    FROM tbl_imp_wms_mrplableprint_assignuser
    WHERE COMPLETEDON IS NULL GROUP BY EAN;

    /* ════════════════════════════════════════════════════════════
       RS6 : MONTHLY RECEIPT TREND (range-aware)
    ════════════════════════════════════════════════════════════ */
    SELECT MONTH_KEY = CONVERT(VARCHAR(6), GRNDATE, 112), RECEIPT_QTY = SUM(RECEIPT_QTY)
    FROM #GRN WHERE GRNDATE >= COALESCE(@FDATE, DATEADD(MONTH, -11, @TDATE))
    GROUP BY CONVERT(VARCHAR(6), GRNDATE, 112);

    /* ════════════════════════════════════════════════════════════
       RS7 : LABEL STATUS
    ════════════════════════════════════════════════════════════ */
    SELECT
        FP        = SUM(CASE WHEN MAKERDT IS NOT NULL AND COMPLETEDON IS NOT NULL THEN RECPTQTY ELSE 0 END),
        PENDING   = SUM(CASE WHEN MAKERDT IS NULL     AND COMPLETEDON IS NULL     THEN RECPTQTY ELSE 0 END),
        INPROCESS = SUM(CASE WHEN MAKERDT IS NOT NULL AND COMPLETEDON IS NULL     THEN RECPTQTY ELSE 0 END)
    FROM tbl_imp_wms_mrplableprint_assignuser;

    /* ════════════════════════════════════════════════════════════
       RS8 : DAILY DISPATCH (range-aware)
    ════════════════════════════════════════════════════════════ */
    SELECT PROCESS_DATE = CONVERT(VARCHAR(10), M.GINDATE, 103), DISPATCH_QTY = SUM(D.ISSUEQTY)
    FROM tbl_imp_wms_goodsissue_dtls D
    INNER JOIN tbl_imp_wms_goodsissue_mst M ON M.GINNO = D.FK_GINNO
    WHERE M.CITYCODE = @CITYCODE
      AND M.ISSUEDATE <= @TEOD
      AND (@FDATE IS NULL OR M.ISSUEDATE >= @FDATE)
    GROUP BY CONVERT(VARCHAR(10), M.GINDATE, 103)
    ORDER BY PROCESS_DATE;

    /* ════════════════════════════════════════════════════════════
       RS9 : BACKLOG CLEARANCE
    ════════════════════════════════════════════════════════════ */
    DECLARE @PendingQty INT, @DailyCapacity FLOAT;
    SELECT @PendingQty = ISNULL(SUM(BAL_QTY), 0) FROM #STOCK;
    SELECT @DailyCapacity = AVG(DailyDispatch) FROM (
        SELECT SUM(D.ISSUEQTY) AS DailyDispatch
        FROM tbl_imp_wms_goodsissue_dtls D
        INNER JOIN tbl_imp_wms_goodsissue_mst M ON M.GINNO = D.FK_GINNO
        WHERE M.CITYCODE = @CITYCODE
        GROUP BY CONVERT(VARCHAR(10), M.GINDATE, 103)
    ) A;
    SELECT @PendingQty AS Pending_Qty, @DailyCapacity AS Daily_Capacity,
           CEILING(@PendingQty * 1.0 / NULLIF(@DailyCapacity, 0)) AS Estimated_Days;

    /* ════════════════════════════════════════════════════════════
       RS10 : DISPATCH BY CLIENT (range-aware)
    ════════════════════════════════════════════════════════════ */
    SELECT
        CLIENT       = ISNULL(E.EXP_NAME, M.CLIENT),
        DISPATCH_QTY = SUM(D.ISSUEQTY),
        GIN_COUNT    = COUNT(DISTINCT M.GINNO)
    FROM tbl_imp_wms_goodsissue_dtls D
    INNER JOIN tbl_imp_wms_goodsissue_mst M ON M.GINNO = D.FK_GINNO
    LEFT  JOIN EXP_MASTER E ON E.EXP_CODE = M.CLIENT
    WHERE M.CITYCODE = @CITYCODE AND M.ISSUEDATE <= @TEOD
      AND (@FDATE IS NULL OR M.ISSUEDATE >= @FDATE)
    GROUP BY ISNULL(E.EXP_NAME, M.CLIENT)
    ORDER BY DISPATCH_QTY DESC;

    /* ════════════════════════════════════════════════════════════
       RS11 : PO vs DISPATCH BY CLIENT
       Fix: join on CLIENT code, not EAN — no cross-join inflation
    ════════════════════════════════════════════════════════════ */
    SELECT
        CLIENT         = ISNULL(E.EXP_NAME, PO_C.CLIENT),
        PO_QTY         = PO_C.PO_QTY,
        DISPATCHED_QTY = ISNULL(GI_C.DISPATCHED_QTY, 0),
        BALANCE_QTY    = PO_C.PO_QTY - ISNULL(GI_C.DISPATCHED_QTY, 0)
    FROM (
        SELECT CLIENT, PO_QTY = SUM(CONVERT(INT, QTY))
        FROM TBL_WMS_CLIENTPO GROUP BY CLIENT
    ) PO_C
    LEFT JOIN EXP_MASTER E ON E.EXP_CODE = PO_C.CLIENT
    LEFT JOIN (
        SELECT M.CLIENT, DISPATCHED_QTY = SUM(D.ISSUEQTY)
        FROM tbl_imp_wms_goodsissue_mst M
        JOIN tbl_imp_wms_goodsissue_dtls D ON D.FK_GINNO = M.GINNO
        WHERE M.CITYCODE = @CITYCODE AND M.ISSUEDATE <= @TDATE
        GROUP BY M.CLIENT
    ) GI_C ON GI_C.CLIENT = PO_C.CLIENT
    ORDER BY PO_QTY DESC;

    /* ════════════════════════════════════════════════════════════
       RS12 : PO TRACKING (PONO LEVEL) + STR CREATION DATE
    ════════════════════════════════════════════════════════════ */
    SELECT
        PO.PONO,
        PO.CLIENT,
        STR_CREATION_DATE  = ISNULL(CONVERT(VARCHAR(10), MIN(L.MAKERDT), 103), ''),
        PO_QTY             = SUM(CONVERT(INT, PO.QTY)),
        DISPATCHED         = ISNULL(MAX(PD.DISPATCHED_QTY), 0),
        BALANCE            = SUM(CONVERT(INT, PO.QTY)) - ISNULL(MAX(PD.DISPATCHED_QTY), 0),
        SKU_COUNT          = COUNT(DISTINCT PO.GTIN),
        LAST_DISPATCH_DATE = ISNULL(MAX(PD.LAST_DISPATCH_DATE), ''),
        GIN_NOS            = ISNULL((
            SELECT STUFF((
                SELECT DISTINCT ', ' + GM.GINNO
                FROM tbl_imp_wms_goodsissue_mst GM
                WHERE GM.ACKNO = PO.PONO
                FOR XML PATH('')
            ), 1, 2, '')
        ), '')
    FROM TBL_WMS_CLIENTPO PO
    LEFT JOIN #PO_DISPATCHED PD ON PD.PONO = PO.PONO
    LEFT JOIN TBL_IMP_WMS_CLIENTPO_UPLOAD_CSV_LOG L ON L.PK_ID = PO.LOGID
	where PO.PONO not in ('DEADSTOCK260220-00')
    GROUP BY PO.PONO, PO.CLIENT
    ORDER BY PO.PONO;

    /* ════════════════════════════════════════════════════════════
       RS13 : CONTAINER / SHIPMENT SUMMARY
    ════════════════════════════════════════════════════════════ */
    SELECT G.CONTAINERNO, G.SHIPMENTTYPE,
        FIRST_GRN_DATE = CONVERT(VARCHAR(10), MIN(G.GRNDATE), 103),
        LAST_GRN_DATE  = CONVERT(VARCHAR(10), MAX(G.GRNDATE), 103),
        SKU_COUNT      = COUNT(DISTINCT G.EAN),
        RECEIPT_QTY    = SUM(G.RECEIPT_QTY),
        AGING_DAYS     = DATEDIFF(DAY, MIN(G.GRNDATE), @TDATE),
        MRP_PENDING_QTY = ISNULL((
            SELECT SUM(A.RECPTQTY)
            FROM tbl_imp_wms_mrplableprint_assignuser A
            JOIN TBL_IMP_WMS_GRN_DTLS D2 ON D2.ID = A.FK_GRNDTLID
            JOIN TBL_IMP_WMS_GRN_MASTER M2 ON M2.GRNNO = D2.GRNNO
            WHERE M2.CONTAINERNO = G.CONTAINERNO AND A.COMPLETEDON IS NULL
        ), 0)
    FROM #GRN G
    GROUP BY G.CONTAINERNO, G.SHIPMENTTYPE
    HAVING (@FDATE IS NULL OR MAX(G.GRNDATE) >= @FDATE)
    ORDER BY MIN(G.GRNDATE) DESC;

    /* ════════════════════════════════════════════════════════════
       RS14 : RECEIPT BY CLIENT (via PO)
    ════════════════════════════════════════════════════════════ */
    SELECT
        CLIENT      = ISNULL(E.EXP_NAME, PO.CLIENT),
        RECEIPT_QTY = SUM(CONVERT(INT, PO.QTY)),
        PONO_COUNT  = COUNT(DISTINCT PO.PONO),
        SKU_COUNT   = COUNT(DISTINCT PO.GTIN)
    FROM TBL_WMS_CLIENTPO PO
    LEFT JOIN EXP_MASTER E ON E.EXP_CODE = PO.CLIENT
    GROUP BY ISNULL(E.EXP_NAME, PO.CLIENT)
    ORDER BY RECEIPT_QTY DESC;

    /* ════════════════════════════════════════════════════════════
       RS15 : MRP DAILY LABELLING PRODUCTIVITY (range-aware)
    ════════════════════════════════════════════════════════════ */
    SELECT
        COMPLETED_DATE  = CONVERT(VARCHAR(10), CompletedOn, 103),
        LABELS_DONE     = COUNT(*),
        UNITS_LABELLED  = SUM(RecptQty)
    FROM tbl_imp_wms_mrplableprint_assignuser
    WHERE CompletedOn IS NOT NULL
      AND CompletedOn >= COALESCE(@FDATE, DATEADD(DAY, -60, @TDATE))
      AND CompletedOn <= @TEOD
    GROUP BY CONVERT(VARCHAR(10), CompletedOn, 103)
    ORDER BY COMPLETED_DATE;

    /* ════════════════════════════════════════════════════════════
       RS16 : MRP PENDING BY CONTAINER
    ════════════════════════════════════════════════════════════ */
    SELECT M.CONTAINERNO, M.SHIPMENTTYPE,
        PENDING_TASKS   = COUNT(*),
        PENDING_QTY     = SUM(A.RECPTQTY),
        ASSIGNED_SINCE  = CONVERT(VARCHAR(10), MIN(A.MAKERDT), 103),
        DAYS_PENDING    = DATEDIFF(DAY, MIN(A.MAKERDT), @TDATE)
    FROM tbl_imp_wms_mrplableprint_assignuser A
    JOIN TBL_IMP_WMS_GRN_DTLS D ON D.ID = A.FK_GRNDTLID
    JOIN TBL_IMP_WMS_GRN_MASTER M ON M.GRNNO = D.GRNNO
    WHERE A.COMPLETEDON IS NULL
    GROUP BY M.CONTAINERNO, M.SHIPMENTTYPE
    ORDER BY PENDING_QTY DESC;

    /* ════════════════════════════════════════════════════════════
       RS17 : ARTICLE TYPE BREAKDOWN
    ════════════════════════════════════════════════════════════ */
    SELECT
        ARTICLETYPE   = ISNULL(NULLIF(ARTICLETYPE,''), 'Other'),
        SKU_COUNT     = COUNT(DISTINCT GTIN),
        PO_QTY        = SUM(CONVERT(INT, QTY)),
        GENDER_MIX    = STUFF((
            SELECT DISTINCT ', ' + GENDER
            FROM TBL_WMS_CLIENTPO PO2
            WHERE PO2.ARTICLETYPE = PO.ARTICLETYPE AND GENDER IS NOT NULL AND GENDER != ''
            FOR XML PATH('')
        ), 1, 2, '')
    FROM TBL_WMS_CLIENTPO PO
    WHERE ARTICLETYPE IS NOT NULL AND ARTICLETYPE != ''
    GROUP BY ARTICLETYPE
    ORDER BY PO_QTY DESC;

    /* ════════════════════════════════════════════════════════════
       RS18 : DELIVERY AGENT SUMMARY (range-aware)
    ════════════════════════════════════════════════════════════ */
    SELECT
        DELAGENT     = ISNULL(NULLIF(LTRIM(RTRIM(M.DELAGENT)), ''), 'Unknown'),
        GIN_COUNT    = COUNT(DISTINCT M.GINNO),
        DISPATCH_QTY = SUM(D.ISSUEQTY),
        LAST_DISPATCH = CONVERT(VARCHAR(10), MAX(M.ISSUEDATE), 103)
    FROM tbl_imp_wms_goodsissue_mst M
    JOIN tbl_imp_wms_goodsissue_dtls D ON D.FK_GINNO = M.GINNO
    WHERE M.CITYCODE = @CITYCODE
      AND M.ISSUEDATE <= @TEOD
      AND (@FDATE IS NULL OR M.ISSUEDATE >= @FDATE)
    GROUP BY LTRIM(RTRIM(M.DELAGENT))
    ORDER BY DISPATCH_QTY DESC;

    /* ════════════════════════════════════════════════════════════
       RS19 : GRN DAILY ACTIVITY (range-aware, default last 60 days)
    ════════════════════════════════════════════════════════════ */
    SELECT
        GRN_DATE   = CONVERT(VARCHAR(10), CONVERT(DATETIME, GRNDATE, 103), 103),
        GRN_COUNT  = COUNT(DISTINCT GRNNO),
        CONTAINERS = COUNT(DISTINCT CONTAINERNO),
        UNITS_IN   = (
            SELECT SUM(D2.QTY)
            FROM TBL_IMP_WMS_GRN_DTLS D2
            JOIN TBL_IMP_WMS_GRN_MASTER M2 ON M2.GRNNO = D2.GRNNO
            WHERE M2.CITYCODE = @CITYCODE
              AND M2.GRNDATE = TBL_IMP_WMS_GRN_MASTER.GRNDATE
        )
    FROM TBL_IMP_WMS_GRN_MASTER
    WHERE CITYCODE = @CITYCODE
      AND CONVERT(DATETIME, GRNDATE, 103) >= COALESCE(@FDATE, DATEADD(DAY, -59, @TDATE))
      AND CONVERT(DATETIME, GRNDATE, 103) <= @TDATE
    GROUP BY GRNDATE
    ORDER BY CONVERT(DATETIME, GRNDATE, 103);

    /* ════════════════════════════════════════════════════════════
       RS20 : PO VALUE SUMMARY BY ARTICLE TYPE
    ════════════════════════════════════════════════════════════ */
    SELECT
        ARTICLETYPE     = ISNULL(NULLIF(ARTICLETYPE,''), 'Other'),
        PO_QTY          = SUM(CONVERT(INT, QTY)),
        TOTAL_MRP_VALUE = SUM(CONVERT(INT, QTY) * CONVERT(DECIMAL(18,2), ISNULL(NULLIF(MRP,''),0))),
        AVG_MRP         = AVG(CONVERT(DECIMAL(18,2), ISNULL(NULLIF(MRP,''),0))),
        TOTAL_LANDED    = SUM(CONVERT(INT, QTY) * CONVERT(DECIMAL(18,2), ISNULL(NULLIF(LANDEDPRICE,''),0)))
    FROM TBL_WMS_CLIENTPO
    WHERE ARTICLETYPE IS NOT NULL AND ARTICLETYPE != ''
    GROUP BY ARTICLETYPE
    ORDER BY TOTAL_MRP_VALUE DESC;

    /* ════════════════════════════════════════════════════════════
       RS21 : RANGE KPI (window totals)
    ════════════════════════════════════════════════════════════ */
    SELECT
        STR_COUNT = (SELECT COUNT(*) FROM #STRD
                     WHERE STR_DT IS NOT NULL AND STR_DT <= @TEOD
                       AND (@FDATE IS NULL OR STR_DT >= @FDATE)),
        GRN_QTY = (SELECT ISNULL(SUM(G.RECEIPT_QTY), 0) FROM #GRN G
                   WHERE @FDATE IS NULL OR G.GRNDATE >= @FDATE),
        DISPATCH_QTY = (SELECT ISNULL(SUM(GD.ISSUEQTY), 0)
                        FROM tbl_imp_wms_goodsissue_mst GM
                        JOIN tbl_imp_wms_goodsissue_dtls GD ON GD.FK_GINNO = GM.GINNO
                        WHERE GM.CITYCODE = @CITYCODE AND GM.ISSUEDATE <= @TEOD
                          AND (@FDATE IS NULL OR GM.ISSUEDATE >= @FDATE)),
        GIN_COUNT = (SELECT COUNT(DISTINCT GM.GINNO)
                     FROM tbl_imp_wms_goodsissue_mst GM
                     WHERE GM.CITYCODE = @CITYCODE AND GM.ISSUEDATE <= @TEOD
                       AND (@FDATE IS NULL OR GM.ISSUEDATE >= @FDATE)),
        RETURN_QTY = (SELECT ISNULL(SUM(D.RETURNQTY), 0)
                      FROM #RTV R JOIN tbl_imp_wms_goodsreturn_dtls D ON D.FK_GRTNNO = R.GRTNNO),
        RO_COUNT   = (SELECT COUNT(DISTINCT RETURNNO) FROM #RTV),
        GRTN_COUNT = (SELECT COUNT(*) FROM #RTV),
        RETURN_USABLE_QTY = (SELECT ISNULL(SUM(D.RETURNQTY), 0)
                             FROM #RTV R JOIN tbl_imp_wms_goodsreturn_dtls D ON D.FK_GRTNNO = R.GRTNNO
                             WHERE D.FK_RETURNREASON = 1),
        RETURN_NONUSABLE_QTY = (SELECT ISNULL(SUM(D.RETURNQTY), 0)
                                FROM #RTV R JOIN tbl_imp_wms_goodsreturn_dtls D ON D.FK_GRTNNO = R.GRTNNO
                                WHERE ISNULL(D.FK_RETURNREASON, 0) = 0);

    /* ════════════════════════════════════════════════════════════
       RS22 : STR TRACKING (PO level + STR date + dispatch TAT)
       In-window = STR created in window OR dispatched in window;
       no range -> every PO.
    ════════════════════════════════════════════════════════════ */
    SELECT
        P.PONO,
        P.CLIENT,
        STR_CREATION_DATE = CASE WHEN S.STR_DT IS NULL THEN ''
                                 ELSE CONVERT(VARCHAR(10), S.STR_DT, 103) END,
        P.PO_QTY,
        P.SKU_COUNT,
        DISPATCHED          = ISNULL(D.DISP_TOTAL, 0),
        DISPATCHED_IN_RANGE = ISNULL(D.DISP_RANGE, 0),
        BALANCE             = P.PO_QTY - ISNULL(D.DISP_TOTAL, 0),
        FIRST_DISPATCH_DATE = CASE WHEN D.FIRST_DISP IS NULL THEN ''
                                   ELSE CONVERT(VARCHAR(10), D.FIRST_DISP, 103) END,
        LAST_DISPATCH_DATE  = CASE WHEN D.LAST_DISP IS NULL THEN ''
                                   ELSE CONVERT(VARCHAR(10), D.LAST_DISP, 103) END,
        STR_TO_DISPATCH_DAYS = CASE WHEN S.STR_DT IS NULL OR D.FIRST_DISP IS NULL THEN NULL
                                    ELSE DATEDIFF(DAY, S.STR_DT, D.FIRST_DISP) END,
        GIN_NOS = ISNULL(STUFF((
            SELECT DISTINCT ', ' + GM.GINNO
            FROM tbl_imp_wms_goodsissue_mst GM
            WHERE GM.ACKNO = P.PONO
            FOR XML PATH('')
        ), 1, 2, ''), '')
    FROM (SELECT PONO, CLIENT,
                 PO_QTY = SUM(CONVERT(INT, QTY)),
                 SKU_COUNT = COUNT(DISTINCT GTIN)
          FROM TBL_WMS_CLIENTPO GROUP BY PONO, CLIENT) P
    LEFT JOIN #STRD S ON S.PONO = P.PONO
    LEFT JOIN #DISP D ON D.PONO = P.PONO
    WHERE P.PONO NOT IN ('DEADSTOCK260220-00')
      AND (@FDATE IS NULL
           OR (S.STR_DT >= @FDATE AND S.STR_DT <= @TEOD)
           OR (D.LAST_DISP >= @FDATE AND D.LAST_DISP <= @TEOD))
    ORDER BY CASE WHEN S.STR_DT IS NULL THEN 0 ELSE 1 END DESC, S.STR_DT DESC, P.PONO;

    /* ════════════════════════════════════════════════════════════
       RS23 : RTV SUMMARY (per return note)
       QTY_ISSUED = qty declared on the Myntra RO file (scantype E) or
       scanned at entry (N/K) - single capture today. QTY_RECEIVED
       mirrors it until the ERP adds scan-verify against the RO; kept
       separate so the report shape never changes.
    ════════════════════════════════════════════════════════════ */
    SELECT
        R.GRTNNO,
        RETURNNO      = ISNULL(R.RETURNNO, ''),
        CLIENTINVNO   = ISNULL(R.CLIENTINVNO, ''),
        RECEIVED_DATE = CONVERT(VARCHAR(10), R.RECV_DT, 103),
        ENTRY_DATE    = CONVERT(VARCHAR(10), R.ENTRY_DT, 103),
        SOURCE = CASE R.SCANTYPE WHEN 'E' THEN 'RO FILE'
                                 WHEN 'N' THEN 'MANUAL SCAN'
                                 WHEN 'K' THEN 'KIABI CODE'
                                 ELSE ISNULL(R.SCANTYPE, '') END,
        SKU_COUNT     = COUNT(DISTINCT D.EAN),
        QTY_ISSUED    = ISNULL(SUM(D.RETURNQTY), 0),
        QTY_RECEIVED  = ISNULL(SUM(D.RETURNQTY), 0),
        MISSING_QTY   = 0,
        USABLE_QTY    = ISNULL(SUM(CASE WHEN D.FK_RETURNREASON = 1 THEN D.RETURNQTY ELSE 0 END), 0),
        NONUSABLE_QTY = ISNULL(SUM(CASE WHEN ISNULL(D.FK_RETURNREASON, 0) = 0 THEN D.RETURNQTY ELSE 0 END), 0),
        RETURN_TYPES  = ISNULL(STUFF((
            SELECT DISTINCT ', ' + U.UNIT_NAME
            FROM tbl_imp_wms_goodsreturn_dtls D2
            JOIN TBL_MST_MEASUREMENT_UNITS U
              ON U.UNIT_CODE = CONVERT(VARCHAR, D2.FK_RETURNTYPE) AND U.UNIT_TYPE = 'RETURNTYPE'
            WHERE D2.FK_GRTNNO = R.GRTNNO
            FOR XML PATH('')
        ), 1, 2, ''), '')
    FROM #RTV R
    LEFT JOIN tbl_imp_wms_goodsreturn_dtls D ON D.FK_GRTNNO = R.GRTNNO
    GROUP BY R.GRTNNO, R.RETURNNO, R.CLIENTINVNO, R.RECV_DT, R.ENTRY_DT, R.SCANTYPE
    ORDER BY R.RECV_DT DESC;

    /* ════════════════════════════════════════════════════════════
       RS24 : RTV EAN DETAIL
    ════════════════════════════════════════════════════════════ */
    SELECT
        R.GRTNNO,
        RETURNNO      = ISNULL(R.RETURNNO, ''),
        RECEIVED_DATE = CONVERT(VARCHAR(10), R.RECV_DT, 103),
        D.EAN,
        SKU = CASE WHEN ISNULL(IM.MSKUCODE, '') != '' THEN IM.MSKUCODE
                   ELSE ISNULL((SELECT MAX(SKU) FROM TBL_WMS_CLIENTPO PO WHERE PO.GTIN = D.EAN), '') END,
        ITEMNAME      = ISNULL(IM.ITEMNAME, ''),
        RETURN_QTY    = D.RETURNQTY,
        CONDITION_    = CASE WHEN D.FK_RETURNREASON = 1 THEN 'USABLE' ELSE 'NON USABLE' END,
        RETURN_TYPE   = ISNULL((SELECT UNIT_NAME FROM TBL_MST_MEASUREMENT_UNITS
                                WHERE UNIT_CODE = CONVERT(VARCHAR, D.FK_RETURNTYPE)
                                  AND UNIT_TYPE = 'RETURNTYPE'), ''),
        CONTAINERNO   = ISNULL(D.CONTAINERNO, ''),
        BOXNO         = ISNULL(D.BOXNO, '')
    FROM #RTV R
    JOIN tbl_imp_wms_goodsreturn_dtls D ON D.FK_GRTNNO = R.GRTNNO
    LEFT JOIN WMS_ITEM_MASTER IM ON IM.PK_ITEMID = D.FK_ITEMID
    ORDER BY R.RECV_DT DESC, R.GRTNNO, D.EAN;

    /* ════════════════════════════════════════════════════════════
       RS25 : DAILY FLOW (receipts / dispatches / returns per day)
    ════════════════════════════════════════════════════════════ */
    SELECT
        FLOW_DATE = CONVERT(VARCHAR(10), F.DT, 103),
        FLOW_SORT = CONVERT(VARCHAR(8),  F.DT, 112),
        RECEIPT_QTY  = SUM(F.RQ),
        DISPATCH_QTY = SUM(F.DQ),
        RETURN_QTY   = SUM(F.XQ)
    FROM (
        SELECT DT = G.GRNDATE, RQ = G.RECEIPT_QTY, DQ = 0, XQ = 0
        FROM #GRN G
        UNION ALL
        SELECT CONVERT(DATETIME, CONVERT(VARCHAR(10), GM.ISSUEDATE, 103), 103), 0, GD.ISSUEQTY, 0
        FROM tbl_imp_wms_goodsissue_mst GM
        JOIN tbl_imp_wms_goodsissue_dtls GD ON GD.FK_GINNO = GM.GINNO
        WHERE GM.CITYCODE = @CITYCODE
        UNION ALL
        SELECT CONVERT(DATETIME, CONVERT(VARCHAR(10), R.RECV_DT, 103), 103), 0, 0, D.RETURNQTY
        FROM #RTV R
        JOIN tbl_imp_wms_goodsreturn_dtls D ON D.FK_GRTNNO = R.GRTNNO
    ) F
    WHERE F.DT <= @TDATE AND (@FDATE IS NULL OR F.DT >= @FDATE)
    GROUP BY F.DT
    ORDER BY F.DT;

END
`;

(async () => {
  const pool = await sql.connect(cfg);

  // 1. backup the live definition (skip if already backed up)
  const exists = await pool.request()
    .query(`SELECT OBJECT_ID('dbo.${BACKUP}','P') AS id`);
  if (exists.recordset[0].id) {
    console.log(`${BACKUP} already exists - keeping the earlier backup.`);
  } else {
    const r = await pool.request()
      .query(`SELECT OBJECT_DEFINITION(OBJECT_ID('USP_WMS_DASHBOARD_V3')) AS def`);
    const def = r.recordset[0].def;
    if (!def) throw new Error('USP_WMS_DASHBOARD_V3 not found');
    const bk = def.replace(
      /CREATE\s+PROCEDURE\s+\[dbo\]\.\[USP_WMS_DASHBOARD_V3\]/i,
      `CREATE PROCEDURE [dbo].[${BACKUP}]`
    );
    if (bk === def) throw new Error('backup rename did not match');
    await pool.request().batch(bk);
    console.log(`Backup created: ${BACKUP}`);
  }

  // 2. install the merged definition
  await pool.request().batch(NEW_DEF);
  console.log('USP_WMS_DASHBOARD_V3 upgraded to v3.2 (25 recordsets, @FROMDATE).');

  await pool.close();
})().catch(e => { console.error(e.message); process.exit(1); });
