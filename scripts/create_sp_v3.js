const sql = require('mssql');
const cfg = {
  server: '180.179.207.163', port: 1433,
  user: 'jolly_a', password: 'Mpprod51', database: 'manilal',
  options: { trustServerCertificate: true, encrypt: false }
};

const SP = `
CREATE PROCEDURE [dbo].[USP_WMS_DASHBOARD_V3]
    @CMPCODE  VARCHAR(2)  = '01',
    @CITYCODE VARCHAR(3)  = 'MUM',
    @ASONDATE VARCHAR(10)           -- dd/MM/yyyy
AS
/*
  USP_WMS_DASHBOARD_V3  -  WMS Stock-Status Dashboard (20 result sets)

  RS1  -> KPI Summary (1 row)
  RS2  -> Shipment Type Summary (IMP/LOC)
  RS3  -> Stock by EAN/SKU (with aging, PO qty)
  RS4  -> Aging Buckets (0-30/31-60/61-90/90+)
  RS5  -> MRP Pending Detail (EAN-level)
  RS6  -> Monthly Receipt Trend (last 12 months)
  RS7  -> Label Status (1 row: FP/PENDING/INPROCESS)
  RS8  -> Daily Dispatch History
  RS9  -> Backlog Clearance (1 row)
  RS10 -> Dispatch by Client
  RS11 -> PO vs Dispatch by Client
  RS12 -> PO Tracking (PONO level)
  RS13 -> Container/Shipment Summary
  RS14 -> Receipt by Client (via PO)
  RS15 -> MRP Labelling Daily Productivity
  RS16 -> MRP Pending by Container
  RS17 -> Article Type / Category Breakdown (from PO)
  RS18 -> Delivery Agent Summary
  RS19 -> GRN Daily Activity (last 30 days)
  RS20 -> PO Value Summary (MRP value by category)
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

    /* ── STEP 2: Issues by EAN (correct – no container join) ── */
    IF OBJECT_ID('tempdb..#ISSUE') IS NOT NULL DROP TABLE #ISSUE;
    SELECT D.EAN, ISSUE_QTY = SUM(D.ISSUEQTY)
    INTO #ISSUE
    FROM tbl_imp_wms_goodsissue_dtls D
    INNER JOIN tbl_imp_wms_goodsissue_mst M ON M.GINNO = D.FK_GINNO
    WHERE M.CITYCODE = @CITYCODE AND M.ISSUEDATE <= @TDATE
    GROUP BY D.EAN;
    CREATE NONCLUSTERED INDEX IX_ISSUE_EAN ON #ISSUE (EAN);

    /* ── STEP 3: Returns by EAN ── */
    IF OBJECT_ID('tempdb..#RETURN') IS NOT NULL DROP TABLE #RETURN;
    SELECT D.EAN, RETURN_QTY = SUM(D.RETURNQTY)
    INTO #RETURN
    FROM TBL_IMP_WMS_GOODSRETURN_DTLS D
    INNER JOIN TBL_IMP_WMS_GOODSRETURN_MST M ON M.GRTNNO = D.FK_GRTNNO
    WHERE M.CITYCODE = @CITYCODE
      AND CONVERT(DATETIME, M.GRTNDATE, 103) <= @TDATE
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

    /* ════════════════════════════════════════════════════════════
       RS1 : KPI SUMMARY
    ════════════════════════════════════════════════════════════ */
    SELECT
        SUM(RECEIPT_QTY)  AS RECEIPT_QTY,
        SUM(ISSUE_QTY)    AS ISSUE_QTY,
        SUM(RETURN_QTY)   AS RETURN_QTY,
        SUM(BAL_QTY)      AS BAL_QTY,
        (SELECT SUM(PO_QTY) FROM #PO) AS PO_QTY,
        -- UNFULFILLED PO = total PO minus already dispatched (more meaningful than BAL-PO)
        (SELECT SUM(PO_QTY) FROM #PO) - SUM(ISSUE_QTY) AS UNFULFILLED_PO_QTY,
        (SELECT COUNT(DISTINCT CONTAINERNO) FROM #GRN) AS CONTAINER_COUNT,
        COUNT(DISTINCT EAN) AS SKU_COUNT,
        SUM(CASE WHEN AGING_DAYS > 90 THEN BAL_QTY ELSE 0 END) AS AGING_90_PLUS,
        -- MRP stats
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
    ════════════════════════════════════════════════════════════ */
    SELECT PO.CLIENT,
        PO_QTY         = SUM(CONVERT(INT, PO.QTY)),
        DISPATCHED_QTY = ISNULL(SUM(GI.ISSUEQTY), 0),
        BALANCE_QTY    = SUM(CONVERT(INT, PO.QTY)) - ISNULL(SUM(GI.ISSUEQTY), 0)
    FROM TBL_WMS_CLIENTPO PO
    LEFT JOIN tbl_imp_wms_goodsissue_dtls GI ON GI.EAN = PO.GTIN
    GROUP BY PO.CLIENT ORDER BY PO_QTY DESC;

    /* ════════════════════════════════════════════════════════════
       RS12 : PO TRACKING (PONO LEVEL)
    ════════════════════════════════════════════════════════════ */
    SELECT PO.PONO, PO.CLIENT,
        PO_QTY    = SUM(CONVERT(INT, PO.QTY)),
        DISPATCHED = ISNULL(SUM(GI.ISSUEQTY), 0),
        BALANCE    = SUM(CONVERT(INT, PO.QTY)) - ISNULL(SUM(GI.ISSUEQTY), 0),
        SKU_COUNT  = COUNT(DISTINCT PO.GTIN),
        -- Link back to GIN via ACKNO
        GIN_NOS = ISNULL((
            SELECT DISTINCT TOP 3 STUFF((
                SELECT DISTINCT ', ' + GM.GINNO
                FROM tbl_imp_wms_goodsissue_mst GM
                WHERE GM.ACKNO = PO.PONO
                FOR XML PATH('')
            ), 1, 2, '')
        ), '')
    FROM TBL_WMS_CLIENTPO PO
    LEFT JOIN tbl_imp_wms_goodsissue_dtls GI ON GI.EAN = PO.GTIN
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
        -- MRP status per container
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
       RS17 : ARTICLE TYPE / CATEGORY BREAKDOWN (from PO)
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
  try { await pool.request().query(`DROP PROCEDURE IF EXISTS [dbo].[USP_WMS_DASHBOARD_V3]`); } catch(e) {}
  const spBody = SP.replace('CREATE PROCEDURE', 'CREATE PROCEDURE');
  await pool.request().query(spBody);
  console.log('USP_WMS_DASHBOARD_V3 created OK');

  const r = await pool.request()
    .input('CMPCODE',  sql.VarChar(2),  '01')
    .input('CITYCODE', sql.VarChar(3),  'MUM')
    .input('ASONDATE', sql.VarChar(10), '30/04/2026')
    .execute('USP_WMS_DASHBOARD_V3');

  const rs = r.recordsets;
  console.log('RS count:', rs.length);
  console.log('RS1 KPI:', JSON.stringify(rs[0][0]));
  console.log('RS2 ShipTypes:', JSON.stringify(rs[1]));
  console.log('RS15 MRP daily (last 3):', JSON.stringify(rs[14]?.slice(-3)));
  console.log('RS16 MRP pending containers:', JSON.stringify(rs[15]));
  console.log('RS17 Top 5 categories:', JSON.stringify(rs[16]?.slice(0,5)));
  console.log('RS18 Delivery agents:', JSON.stringify(rs[17]));
  console.log('RS19 GRN daily (last 3):', JSON.stringify(rs[18]?.slice(-3)));
  console.log('RS20 Value top 3:', JSON.stringify(rs[19]?.slice(0,3)));
  await pool.close();
}
run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
