// Fixes three bugs in USP_WMS_DASHBOARD_V3:
// 1. #RETURN: missing FK_RETURNREASON=1 filter (inflates RETURN_QTY / BAL_QTY)
// 2. RS12 PO Tracking: dispatched was joined on EAN (cross-joins other POs' issues)
//    → now uses ACKNO = PONO via pre-aggregated #PO_DISPATCHED temp table
// 3. RS11 PO vs Dispatch by Client: same EAN cross-join → now joins on CLIENT code

const sql = require('C:/development-manilal/wms/node_modules/mssql');
const cfg = {
  server: '180.179.207.163', port: 1433,
  user: 'jolly_a', password: 'Mpprod51', database: 'manilal',
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
  connectionTimeout: 15000, requestTimeout: 120000,
};

const SP = `
CREATE PROCEDURE [dbo].[USP_WMS_DASHBOARD_V3]
    @CMPCODE  VARCHAR(2)  = '01',
    @CITYCODE VARCHAR(3)  = 'MUM',
    @ASONDATE VARCHAR(10)           -- dd/MM/yyyy
AS
/*
  USP_WMS_DASHBOARD_V3  -  WMS Stock-Status Dashboard (20 result sets)
  Fixes (v3.1):
    - #RETURN now filters ISNULL(FK_RETURNREASON,0)=1  (matches original USP_WMS_DASHBOARD)
    - RS12 PO Tracking: dispatched calculated via ACKNO=PONO (not EAN join)
    - RS11 PO vs Dispatch: joined on CLIENT code (not EAN)
*/
BEGIN
    SET NOCOUNT ON;

    DECLARE @TDATE DATETIME;
    SET @TDATE = CONVERT(DATETIME, @ASONDATE, 103);

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
      AND ISNULL(D.FK_RETURNREASON, 0) = 1       -- ← FIX: only valid returns
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
    ════════════════════════════════════════════════════════════ */
    SELECT
        SRNO       = ROW_NUMBER() OVER (ORDER BY S.EAN),
        S.EAN,
        S.RECEIPT_QTY, S.ISSUE_QTY, S.RETURN_QTY, S.BAL_QTY,
        PO_QTY     = ISNULL(P.PO_QTY, 0),
        OLDEST_GRN = CONVERT(VARCHAR(10), S.OLDEST_GRN, 103),
        S.AGING_DAYS
    FROM #STOCK S LEFT JOIN #PO P ON P.EAN = S.EAN;

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
       RS6 : MONTHLY RECEIPT TREND
    ════════════════════════════════════════════════════════════ */
    SELECT MONTH_KEY = CONVERT(VARCHAR(6), GRNDATE, 112), RECEIPT_QTY = SUM(RECEIPT_QTY)
    FROM #GRN WHERE GRNDATE >= DATEADD(MONTH, -11, @TDATE)
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
       RS8 : DAILY DISPATCH
    ════════════════════════════════════════════════════════════ */
    SELECT PROCESS_DATE = CONVERT(VARCHAR(10), M.GINDATE, 103), DISPATCH_QTY = SUM(D.ISSUEQTY)
    FROM tbl_imp_wms_goodsissue_dtls D
    INNER JOIN tbl_imp_wms_goodsissue_mst M ON M.GINNO = D.FK_GINNO
    WHERE M.CITYCODE = @CITYCODE
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
       RS10 : DISPATCH BY CLIENT
    ════════════════════════════════════════════════════════════ */
    SELECT
        CLIENT       = ISNULL(E.EXP_NAME, M.CLIENT),
        DISPATCH_QTY = SUM(D.ISSUEQTY),
        GIN_COUNT    = COUNT(DISTINCT M.GINNO)
    FROM tbl_imp_wms_goodsissue_dtls D
    INNER JOIN tbl_imp_wms_goodsissue_mst M ON M.GINNO = D.FK_GINNO
    LEFT  JOIN EXP_MASTER E ON E.EXP_CODE = M.CLIENT
    WHERE M.CITYCODE = @CITYCODE AND M.ISSUEDATE <= @TDATE
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
       RS12 : PO TRACKING (PONO LEVEL)
       Fix: DISPATCHED via #PO_DISPATCHED (ACKNO=PONO), not EAN join
    ════════════════════════════════════════════════════════════ */
    SELECT
        PO.PONO,
        PO.CLIENT,
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
       RS15 : MRP DAILY LABELLING PRODUCTIVITY
    ════════════════════════════════════════════════════════════ */
    SELECT
        COMPLETED_DATE  = CONVERT(VARCHAR(10), CompletedOn, 103),
        LABELS_DONE     = COUNT(*),
        UNITS_LABELLED  = SUM(RecptQty)
    FROM tbl_imp_wms_mrplableprint_assignuser
    WHERE CompletedOn IS NOT NULL
      AND CompletedOn >= DATEADD(DAY, -60, @TDATE)
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
       RS18 : DELIVERY AGENT SUMMARY
    ════════════════════════════════════════════════════════════ */
    SELECT
        DELAGENT     = ISNULL(NULLIF(LTRIM(RTRIM(M.DELAGENT)), ''), 'Unknown'),
        GIN_COUNT    = COUNT(DISTINCT M.GINNO),
        DISPATCH_QTY = SUM(D.ISSUEQTY),
        LAST_DISPATCH = CONVERT(VARCHAR(10), MAX(M.ISSUEDATE), 103)
    FROM tbl_imp_wms_goodsissue_mst M
    JOIN tbl_imp_wms_goodsissue_dtls D ON D.FK_GINNO = M.GINNO
    WHERE M.CITYCODE = @CITYCODE
    GROUP BY LTRIM(RTRIM(M.DELAGENT))
    ORDER BY DISPATCH_QTY DESC;

    /* ════════════════════════════════════════════════════════════
       RS19 : GRN DAILY ACTIVITY (last 60 days)
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
      AND CONVERT(DATETIME, GRNDATE, 103) >= DATEADD(DAY, -59, @TDATE)
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

END
`;

async function run() {
  const pool = await sql.connect(cfg);

  console.log('Dropping old USP_WMS_DASHBOARD_V3...');
  await pool.request().query(`IF OBJECT_ID('USP_WMS_DASHBOARD_V3') IS NOT NULL DROP PROCEDURE USP_WMS_DASHBOARD_V3`);

  console.log('Creating corrected USP_WMS_DASHBOARD_V3...');
  await pool.request().query(SP);
  console.log('SP created.');

  // Verify: compare old return total vs new (with filter)
  console.log('\nVerifying fix — comparing RETURN_QTY with and without FK_RETURNREASON filter:');
  const chk = await pool.request().query(`
    SELECT
      ALL_RETURNS  = (SELECT SUM(RETURNQTY) FROM TBL_IMP_WMS_GOODSRETURN_DTLS),
      VALID_ONLY   = (SELECT SUM(RETURNQTY) FROM TBL_IMP_WMS_GOODSRETURN_DTLS WHERE ISNULL(FK_RETURNREASON,0)=1),
      DIFF         = (SELECT SUM(RETURNQTY) FROM TBL_IMP_WMS_GOODSRETURN_DTLS) -
                     (SELECT SUM(RETURNQTY) FROM TBL_IMP_WMS_GOODSRETURN_DTLS WHERE ISNULL(FK_RETURNREASON,0)=1)
  `);
  console.table(chk.recordset);

  // Verify RS1 KPI from fresh SP
  console.log('\nRS1 KPI from corrected SP (30/04/2026):');
  const kpi = await pool.request()
    .input('CMPCODE', sql.VarChar(2), '01')
    .input('CITYCODE', sql.VarChar(3), 'MUM')
    .input('ASONDATE', sql.VarChar(10), '30/04/2026')
    .execute('USP_WMS_DASHBOARD_V3');
  console.table(kpi.recordsets[0]);

  // Verify RS12 for STNITFABP230426-10 and neighbours
  console.log('\nRS12 PO Tracking sample (first 5):');
  const sample = kpi.recordsets[11].slice(0,5);
  console.table(sample);

  await sql.close();
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
