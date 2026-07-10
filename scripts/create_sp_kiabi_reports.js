// Creates USP_WMS_KIABI_REPORTS - the combined SP for the KIABI dashboard
// changes requested in the 09/07/2026 mail (Rizwan):
//   1. Start/End date range filtering for the flow reports
//   2. STR creation date (= date the STR/PO CSV was uploaded to the system,
//      TBL_IMP_WMS_CLIENTPO_UPLOAD_CSV_LOG.MAKERDT via TBL_WMS_CLIENTPO.LOGID)
//   3. RTV return details (Myntra RO no, received date, qty issued/received,
//      missing, usable/non-usable split, EAN-level detail)
//
// A brand-new SP - USP_WMS_DASHBOARD_V3 is NOT touched. Called only from the
// Next.js API (node-mssql), so optional params with defaults are fine (the
// WebApi DAL param-count restriction does not apply here).
//
// NOTE on QTY_ISSUED vs QTY_RECEIVED: since Feb 2025 returns are captured by
// uploading the Myntra RO CSV (scantype 'E'), which stores the DECLARED qty.
// A separate physical scan-verify qty is not captured anywhere in the DB yet,
// so both columns read from the same source and MISSING_QTY is 0 until the
// ERP adds a scan-against-RO step. Columns are kept separate so the frontend
// does not change when that lands.

const sql = require('mssql');
const cfg = {
  server: '180.179.207.163', port: 1433,
  user: 'jolly_a', password: 'Mpprod51', database: 'manilal',
  options: { trustServerCertificate: true, encrypt: false },
  requestTimeout: 300000,
};

const SP = `
CREATE PROCEDURE [dbo].[USP_WMS_KIABI_REPORTS]
    @CMPCODE  VARCHAR(2)  = '01',
    @CITYCODE VARCHAR(3)  = 'MUM',
    @FROMDATE VARCHAR(10) = '',   -- dd/MM/yyyy, '' = open start
    @TODATE   VARCHAR(10) = ''    -- dd/MM/yyyy, '' = today
AS
/*
  USP_WMS_KIABI_REPORTS  -  KIABI mail 09/07/2026 (Rizwan)
  RS1 : META            - echo of the resolved parameters
  RS2 : RANGE KPI       - one-row totals for the selected window
  RS3 : STR TRACKING    - PO level + STR creation date + dispatch TAT
  RS4 : RTV SUMMARY     - one row per goods-return note (GRTN / Myntra RO)
  RS5 : RTV EAN DETAIL  - EAN level lines of every return in the window
  RS6 : DAILY FLOW      - per-day receipts / dispatches / returns in window
*/
BEGIN
    SET NOCOUNT ON;

    DECLARE @FDATE DATETIME =
        CASE WHEN ISNULL(@FROMDATE,'') = '' THEN NULL
             ELSE CONVERT(DATETIME, @FROMDATE, 103) END;
    DECLARE @TDATE DATETIME =
        CASE WHEN ISNULL(@TODATE,'') = ''
             THEN CONVERT(DATETIME, CONVERT(VARCHAR(10), GETDATE(), 103), 103)
             ELSE CONVERT(DATETIME, @TODATE, 103) END;
    -- inclusive end-of-day bound for datetime columns
    DECLARE @TEOD DATETIME = DATEADD(SECOND, -1, DATEADD(DAY, 1, @TDATE));

    /* ── STR creation date per PONO (upload log via LOGID) ── */
    IF OBJECT_ID('tempdb..#STRD') IS NOT NULL DROP TABLE #STRD;
    SELECT PO.PONO, STR_DT = MIN(L.MAKERDT)
    INTO #STRD
    FROM (SELECT DISTINCT PONO, LOGID FROM TBL_WMS_CLIENTPO) PO
    LEFT JOIN TBL_IMP_WMS_CLIENTPO_UPLOAD_CSV_LOG L ON L.PK_ID = PO.LOGID
    GROUP BY PO.PONO;

    /* ── dispatch aggregates per PONO (ACKNO = PONO) ── */
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

    /* ── PO qty per PONO ── */
    IF OBJECT_ID('tempdb..#POQ') IS NOT NULL DROP TABLE #POQ;
    SELECT PONO, CLIENT,
        PO_QTY    = SUM(CONVERT(INT, QTY)),
        SKU_COUNT = COUNT(DISTINCT GTIN)
    INTO #POQ
    FROM TBL_WMS_CLIENTPO
    GROUP BY PONO, CLIENT;

    /* ── returns in window (note level) ── */
    IF OBJECT_ID('tempdb..#RTV') IS NOT NULL DROP TABLE #RTV;
    SELECT M.GRTNNO, M.RETURNNO, M.CLIENTINVNO, M.CLIENT, M.SCANTYPE,
        RECV_DT  = ISNULL(M.RETURNDATE, CONVERT(DATETIME, M.GRTNDATE, 103)),
        ENTRY_DT = M.MAKERDT
    INTO #RTV
    FROM tbl_imp_wms_goodsreturn_mst M
    WHERE M.CMPCODE = @CMPCODE AND M.CITYCODE = @CITYCODE
      AND ISNULL(M.RETURNDATE, CONVERT(DATETIME, M.GRTNDATE, 103)) <= @TEOD
      AND (@FDATE IS NULL OR ISNULL(M.RETURNDATE, CONVERT(DATETIME, M.GRTNDATE, 103)) >= @FDATE);

    /* ════════════ RS1 : META ════════════ */
    SELECT
        FROMDATE = CASE WHEN @FDATE IS NULL THEN '' ELSE CONVERT(VARCHAR(10), @FDATE, 103) END,
        TODATE   = CONVERT(VARCHAR(10), @TDATE, 103),
        CMPCODE  = @CMPCODE, CITYCODE = @CITYCODE;

    /* ════════════ RS2 : RANGE KPI ════════════ */
    SELECT
        STR_COUNT = (SELECT COUNT(*) FROM #STRD
                     WHERE STR_DT IS NOT NULL AND STR_DT <= @TEOD
                       AND (@FDATE IS NULL OR STR_DT >= @FDATE)),
        GRN_QTY = (SELECT ISNULL(SUM(D.QTY), 0)
                   FROM TBL_IMP_WMS_GRN_MASTER M
                   JOIN TBL_IMP_WMS_GRN_DTLS D ON D.FK_GRNMSTID = M.ID
                   WHERE M.CITYCODE = @CITYCODE
                     AND CONVERT(DATETIME, M.GRNDATE, 103) <= @TDATE
                     AND (@FDATE IS NULL OR CONVERT(DATETIME, M.GRNDATE, 103) >= @FDATE)),
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

    /* ════════════ RS3 : STR TRACKING ════════════
       In-window = STR created in window OR dispatched in window.
       No range given -> every PO. */
    SELECT
        P.PONO,
        P.CLIENT,
        STR_CREATION_DATE = CASE WHEN S.STR_DT IS NULL THEN ''
                                 ELSE CONVERT(VARCHAR(10), S.STR_DT, 103) END,
        STR_SORT          = CASE WHEN S.STR_DT IS NULL THEN ''
                                 ELSE CONVERT(VARCHAR(8), S.STR_DT, 112) END,
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
    FROM #POQ P
    LEFT JOIN #STRD S ON S.PONO = P.PONO
    LEFT JOIN #DISP D ON D.PONO = P.PONO
    WHERE P.PONO NOT IN ('DEADSTOCK260220-00')   -- same exclusion as V3 RS12
      AND (@FDATE IS NULL
           OR (S.STR_DT >= @FDATE AND S.STR_DT <= @TEOD)
           OR (D.LAST_DISP >= @FDATE AND D.LAST_DISP <= @TEOD))
    ORDER BY CASE WHEN S.STR_DT IS NULL THEN 0 ELSE 1 END DESC, S.STR_DT DESC, P.PONO;

    /* ════════════ RS4 : RTV SUMMARY (per return note) ════════════
       QTY_ISSUED  = qty declared on the Myntra RO file (scantype E) or
                     scanned at entry (scantype N/K) - single capture today.
       QTY_RECEIVED mirrors it until the ERP adds scan-verify against RO;
       kept as separate columns so the report shape never changes. */
    SELECT
        R.GRTNNO,
        RETURNNO      = ISNULL(R.RETURNNO, ''),
        CLIENTINVNO   = ISNULL(R.CLIENTINVNO, ''),
        RECEIVED_DATE = CONVERT(VARCHAR(10), R.RECV_DT, 103),
        RECEIVED_SORT = CONVERT(VARCHAR(8),  R.RECV_DT, 112),
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

    /* ════════════ RS5 : RTV EAN DETAIL ════════════ */
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

    /* ════════════ RS6 : DAILY FLOW ════════════ */
    SELECT
        FLOW_DATE = CONVERT(VARCHAR(10), F.DT, 103),
        FLOW_SORT = CONVERT(VARCHAR(8),  F.DT, 112),
        RECEIPT_QTY  = SUM(F.RQ),
        DISPATCH_QTY = SUM(F.DQ),
        RETURN_QTY   = SUM(F.XQ)
    FROM (
        SELECT DT = CONVERT(DATETIME, M.GRNDATE, 103), RQ = D.QTY, DQ = 0, XQ = 0
        FROM TBL_IMP_WMS_GRN_MASTER M
        JOIN TBL_IMP_WMS_GRN_DTLS D ON D.FK_GRNMSTID = M.ID
        WHERE M.CITYCODE = @CITYCODE
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
  await pool.request().query(`IF OBJECT_ID('dbo.USP_WMS_KIABI_REPORTS','P') IS NOT NULL DROP PROCEDURE dbo.USP_WMS_KIABI_REPORTS`);
  await pool.request().batch(SP);
  console.log('USP_WMS_KIABI_REPORTS created.');
  await pool.close();
})().catch(e => { console.error(e.message); process.exit(1); });
