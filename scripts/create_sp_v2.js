const sql = require('mssql');
const cfg = {
  server: '180.179.207.163', port: 1433,
  user: 'jolly_a', password: 'Mpprod51', database: 'manilal',
  options: { trustServerCertificate: true, encrypt: false }
};

const SP = `
CREATE OR ALTER PROCEDURE [dbo].[USP_WMS_DASHBOARD_V2]
    @CMPCODE  VARCHAR(2)  = '01',
    @CITYCODE VARCHAR(3)  = 'MUM',
    @ASONDATE VARCHAR(10)
AS
/*
  USP_WMS_DASHBOARD_V2
  KEY FIX: Issues/Returns aggregated by EAN only (not EAN+CONTAINERNO).
  Old join on EAN+CONTAINERNO missed ~8% of issue rows due to format differences.

  RS1  -> KPI Summary               (1 row)
  RS2  -> Ship Type Summary         (IMP/LOC)
  RS3  -> Stock by EAN/SKU
  RS4  -> Aging Buckets             (0-30/31-60/61-90/90+)
  RS5  -> MRP Pending Detail
  RS6  -> Monthly Receipt Trend     (last 12 months)
  RS7  -> Label Status              (1 row)
  RS8  -> Daily Dispatch
  RS9  -> Backlog Clearance         (1 row)
  RS10 -> Dispatch by Client
  RS11 -> PO vs Dispatch by Client
  RS12 -> PO Tracking (PONO level)
  RS13 -> Container/Shipment Summary
  RS14 -> GRN Receipt by Client
*/
BEGIN
    SET NOCOUNT ON;

    DECLARE @TDATE DATETIME;
    SET @TDATE = CONVERT(DATETIME, @ASONDATE, 103);

    -- STEP 1: GRN receipts
    IF OBJECT_ID('tempdb..#GRN') IS NOT NULL DROP TABLE #GRN;
    SELECT
        M.GRNNO, M.CONTAINERNO, M.SHIPMENTTYPE,
        GRNDATE     = CONVERT(DATETIME, M.GRNDATE, 103),
        D.EAN,
        RECEIPT_QTY = D.QTY
    INTO #GRN
    FROM TBL_IMP_WMS_GRN_MASTER M
    INNER JOIN TBL_IMP_WMS_GRN_DTLS D ON D.FK_GRNMSTID = M.ID
    WHERE M.CITYCODE = @CITYCODE
      AND CONVERT(DATETIME, M.GRNDATE, 103) <= @TDATE;
    CREATE NONCLUSTERED INDEX IX_GRN_EAN  ON #GRN (EAN);
    CREATE NONCLUSTERED INDEX IX_GRN_CONT ON #GRN (CONTAINERNO);

    -- STEP 2: Issues by EAN only (KEY FIX)
    IF OBJECT_ID('tempdb..#ISSUE') IS NOT NULL DROP TABLE #ISSUE;
    SELECT D.EAN, ISSUE_QTY = SUM(D.ISSUEQTY)
    INTO #ISSUE
    FROM tbl_imp_wms_goodsissue_dtls D
    INNER JOIN tbl_imp_wms_goodsissue_mst M ON M.GINNO = D.FK_GINNO
    WHERE M.CITYCODE = @CITYCODE AND M.ISSUEDATE <= @TDATE
    GROUP BY D.EAN;
    CREATE NONCLUSTERED INDEX IX_ISSUE_EAN ON #ISSUE (EAN);

    -- STEP 3: Returns by EAN only
    IF OBJECT_ID('tempdb..#RETURN') IS NOT NULL DROP TABLE #RETURN;
    SELECT D.EAN, RETURN_QTY = SUM(D.RETURNQTY)
    INTO #RETURN
    FROM TBL_IMP_WMS_GOODSRETURN_DTLS D
    INNER JOIN TBL_IMP_WMS_GOODSRETURN_MST M ON M.GRTNNO = D.FK_GRTNNO
    WHERE M.CITYCODE = @CITYCODE
      AND CONVERT(DATETIME, M.GRTNDATE, 103) <= @TDATE
    GROUP BY D.EAN;
    CREATE NONCLUSTERED INDEX IX_RETURN_EAN ON #RETURN (EAN);

    -- STEP 4: EAN-level correct stock
    IF OBJECT_ID('tempdb..#STOCK') IS NOT NULL DROP TABLE #STOCK;
    SELECT
        G.EAN,
        RECEIPT_QTY = SUM(G.RECEIPT_QTY),
        ISSUE_QTY   = ISNULL(MAX(I.ISSUE_QTY),  0),
        RETURN_QTY  = ISNULL(MAX(R.RETURN_QTY), 0),
        BAL_QTY     = SUM(G.RECEIPT_QTY) - ISNULL(MAX(I.ISSUE_QTY), 0)
                      + ISNULL(MAX(R.RETURN_QTY), 0),
        OLDEST_GRN  = MIN(G.GRNDATE),
        AGING_DAYS  = DATEDIFF(DAY, MIN(G.GRNDATE), @TDATE)
    INTO #STOCK
    FROM #GRN G
    LEFT JOIN #ISSUE  I ON I.EAN = G.EAN
    LEFT JOIN #RETURN R ON R.EAN = G.EAN
    GROUP BY G.EAN;
    CREATE NONCLUSTERED INDEX IX_STOCK_EAN ON #STOCK (EAN);

    -- STEP 5: PO totals by EAN
    IF OBJECT_ID('tempdb..#PO') IS NOT NULL DROP TABLE #PO;
    SELECT GTIN AS EAN, PO_QTY = SUM(CONVERT(INT, QTY))
    INTO #PO FROM TBL_WMS_CLIENTPO GROUP BY GTIN;
    CREATE NONCLUSTERED INDEX IX_PO_EAN ON #PO (EAN);

    -- RS1: KPI Summary
    SELECT
        SUM(RECEIPT_QTY)  AS RECEIPT_QTY,
        SUM(ISSUE_QTY)    AS ISSUE_QTY,
        SUM(RETURN_QTY)   AS RETURN_QTY,
        SUM(BAL_QTY)      AS BAL_QTY,
        (SELECT SUM(PO_QTY) FROM #PO) AS PO_QTY,
        SUM(BAL_QTY) - (SELECT SUM(PO_QTY) FROM #PO) AS AVAILABLE_QTY,
        (SELECT COUNT(DISTINCT CONTAINERNO) FROM #GRN) AS CONTAINER_COUNT,
        COUNT(DISTINCT EAN) AS SKU_COUNT,
        SUM(CASE WHEN AGING_DAYS > 90 THEN BAL_QTY ELSE 0 END) AS AGING_90_PLUS
    FROM #STOCK;

    -- RS2: Ship Type Summary (uses real SHIPMENTTYPE)
    SELECT
        G.SHIPMENTTYPE,
        CONTAINER_COUNT = COUNT(DISTINCT G.CONTAINERNO),
        SKU_COUNT       = COUNT(DISTINCT G.EAN),
        RECEIPT_QTY     = SUM(G.RECEIPT_QTY),
        BAL_QTY         = SUM(S.BAL_QTY)
    FROM #GRN G
    INNER JOIN #STOCK S ON S.EAN = G.EAN
    GROUP BY G.SHIPMENTTYPE;

    -- RS3: Stock by EAN/SKU
    SELECT
        SRNO        = ROW_NUMBER() OVER (ORDER BY S.EAN),
        S.EAN,
        S.RECEIPT_QTY,
        S.ISSUE_QTY,
        S.RETURN_QTY,
        S.BAL_QTY,
        PO_QTY      = ISNULL(P.PO_QTY, 0),
        OLDEST_GRN  = CONVERT(VARCHAR(10), S.OLDEST_GRN, 103),
        S.AGING_DAYS
    FROM #STOCK S
    LEFT JOIN #PO P ON P.EAN = S.EAN;

    -- RS4: Aging Buckets
    SELECT
        BUCKET = CASE WHEN AGING_DAYS <= 30 THEN '0-30'
                      WHEN AGING_DAYS <= 60 THEN '31-60'
                      WHEN AGING_DAYS <= 90 THEN '61-90'
                      ELSE '90+' END,
        CNT     = COUNT(*),
        BAL_QTY = SUM(BAL_QTY)
    FROM #STOCK
    GROUP BY CASE WHEN AGING_DAYS <= 30 THEN '0-30'
                  WHEN AGING_DAYS <= 60 THEN '31-60'
                  WHEN AGING_DAYS <= 90 THEN '61-90'
                  ELSE '90+' END;

    -- RS5: MRP Pending Detail
    SELECT EAN, PENDING_QTY = SUM(RECPTQTY)
    FROM TBL_IMP_WMS_MRPLABLEPRINT_ASSIGNUSER
    WHERE COMPLETEDON IS NULL
    GROUP BY EAN;

    -- RS6: Monthly Receipt Trend (last 12 months)
    SELECT
        MONTH_KEY   = CONVERT(VARCHAR(6), GRNDATE, 112),
        RECEIPT_QTY = SUM(RECEIPT_QTY)
    FROM #GRN
    WHERE GRNDATE >= DATEADD(MONTH, -11, @TDATE)
    GROUP BY CONVERT(VARCHAR(6), GRNDATE, 112);

    -- RS7: Label Status
    SELECT
        FP        = SUM(CASE WHEN MAKERDT IS NOT NULL AND COMPLETEDON IS NOT NULL THEN RECPTQTY ELSE 0 END),
        PENDING   = SUM(CASE WHEN MAKERDT IS NULL     AND COMPLETEDON IS NULL     THEN RECPTQTY ELSE 0 END),
        INPROCESS = SUM(CASE WHEN MAKERDT IS NOT NULL AND COMPLETEDON IS NULL     THEN RECPTQTY ELSE 0 END)
    FROM TBL_IMP_WMS_MRPLABLEPRINT_ASSIGNUSER;

    -- RS8: Daily Dispatch
    SELECT
        PROCESS_DATE = CONVERT(VARCHAR(10), M.GINDATE, 103),
        DISPATCH_QTY = SUM(D.ISSUEQTY)
    FROM tbl_imp_wms_goodsissue_dtls D
    INNER JOIN tbl_imp_wms_goodsissue_mst M ON M.GINNO = D.FK_GINNO
    WHERE M.CITYCODE = @CITYCODE
    GROUP BY CONVERT(VARCHAR(10), M.GINDATE, 103)
    ORDER BY PROCESS_DATE;

    -- RS9: Backlog Clearance
    DECLARE @PendingQty INT, @DailyCapacity FLOAT;
    SELECT @PendingQty = ISNULL(SUM(BAL_QTY), 0) FROM #STOCK;
    SELECT @DailyCapacity = AVG(DailyDispatch) FROM (
        SELECT SUM(D.ISSUEQTY) AS DailyDispatch
        FROM tbl_imp_wms_goodsissue_dtls D
        INNER JOIN tbl_imp_wms_goodsissue_mst M ON M.GINNO = D.FK_GINNO
        WHERE M.CITYCODE = @CITYCODE
        GROUP BY CONVERT(VARCHAR(10), M.GINDATE, 103)
    ) A;
    SELECT
        @PendingQty AS Pending_Qty,
        @DailyCapacity AS Daily_Capacity,
        CEILING(@PendingQty * 1.0 / NULLIF(@DailyCapacity, 0)) AS Estimated_Days;

    -- RS10: Dispatch by Client
    SELECT
        CLIENT       = ISNULL(E.EXP_NAME, M.CLIENT),
        DISPATCH_QTY = SUM(D.ISSUEQTY)
    FROM tbl_imp_wms_goodsissue_dtls D
    INNER JOIN tbl_imp_wms_goodsissue_mst M ON M.GINNO = D.FK_GINNO
    LEFT  JOIN EXP_MASTER E ON E.EXP_CODE = M.CLIENT
    WHERE M.CITYCODE = @CITYCODE AND M.ISSUEDATE <= @TDATE
    GROUP BY ISNULL(E.EXP_NAME, M.CLIENT)
    ORDER BY DISPATCH_QTY DESC;

    -- RS11: PO vs Dispatch by Client
    SELECT
        PO.CLIENT,
        PO_QTY         = SUM(CONVERT(INT, PO.QTY)),
        DISPATCHED_QTY = ISNULL(SUM(GI.ISSUEQTY), 0),
        BALANCE_QTY    = SUM(CONVERT(INT, PO.QTY)) - ISNULL(SUM(GI.ISSUEQTY), 0)
    FROM TBL_WMS_CLIENTPO PO
    LEFT JOIN tbl_imp_wms_goodsissue_dtls GI ON GI.EAN = PO.GTIN
    GROUP BY PO.CLIENT
    ORDER BY PO_QTY DESC;

    -- RS12: PO Tracking (PONO level)
    SELECT
        PO.PONO, PO.CLIENT,
        PO_QTY    = SUM(CONVERT(INT, PO.QTY)),
        DISPATCHED = ISNULL(SUM(GI.ISSUEQTY), 0),
        BALANCE    = SUM(CONVERT(INT, PO.QTY)) - ISNULL(SUM(GI.ISSUEQTY), 0)
    FROM TBL_WMS_CLIENTPO PO
    LEFT JOIN tbl_imp_wms_goodsissue_dtls GI ON GI.EAN = PO.GTIN
    GROUP BY PO.PONO, PO.CLIENT
    ORDER BY PO.PONO;

    -- RS13: Container/Shipment Summary
    SELECT
        CONTAINERNO    = G.CONTAINERNO,
        SHIPMENTTYPE   = G.SHIPMENTTYPE,
        FIRST_GRN_DATE = CONVERT(VARCHAR(10), MIN(G.GRNDATE), 103),
        LAST_GRN_DATE  = CONVERT(VARCHAR(10), MAX(G.GRNDATE), 103),
        SKU_COUNT      = COUNT(DISTINCT G.EAN),
        RECEIPT_QTY    = SUM(G.RECEIPT_QTY),
        AGING_DAYS     = DATEDIFF(DAY, MIN(G.GRNDATE), @TDATE)
    FROM #GRN G
    GROUP BY G.CONTAINERNO, G.SHIPMENTTYPE
    ORDER BY MIN(G.GRNDATE) DESC;

    -- RS14: Receipt by Client (via ClientPO)
    SELECT
        CLIENT      = ISNULL(E.EXP_NAME, PO.CLIENT),
        RECEIPT_QTY = SUM(CONVERT(INT, PO.QTY)),
        PONO_COUNT  = COUNT(DISTINCT PO.PONO),
        SKU_COUNT   = COUNT(DISTINCT PO.GTIN)
    FROM TBL_WMS_CLIENTPO PO
    LEFT JOIN EXP_MASTER E ON E.EXP_CODE = PO.CLIENT
    GROUP BY ISNULL(E.EXP_NAME, PO.CLIENT)
    ORDER BY RECEIPT_QTY DESC;

END
`;

async function run() {
  const pool = await sql.connect(cfg);
  // DROP then CREATE (mssql doesn't support GO batches; use DROP+CREATE instead of CREATE OR ALTER)
  try { await pool.request().query(`DROP PROCEDURE IF EXISTS [dbo].[USP_WMS_DASHBOARD_V2]`); } catch(e) {}
  const spBody = SP.replace('CREATE OR ALTER PROCEDURE', 'CREATE PROCEDURE');
  await pool.request().query(spBody);
  console.log('USP_WMS_DASHBOARD_V2 created OK');

  // Quick test
  const r = await pool.request()
    .input('CMPCODE',  sql.VarChar(2),  '01')
    .input('CITYCODE', sql.VarChar(3),  'MUM')
    .input('ASONDATE', sql.VarChar(10), '30/04/2026')
    .execute('USP_WMS_DASHBOARD_V2');
  const kpi = r.recordsets[0][0];
  console.log('RS1 KPI:', JSON.stringify(kpi));
  console.log('RS2 ShipTypes:', JSON.stringify(r.recordsets[1]));
  console.log('RS13 Container count:', r.recordsets[12]?.length, 'containers');
  console.log('RS14 Clients:', JSON.stringify(r.recordsets[13]?.slice(0,3)));
  await pool.close();
}
run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
