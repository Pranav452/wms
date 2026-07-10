// Adds STR_CREATION_DATE to RS12 (PO Tracking) of USP_WMS_DASHBOARD_V3.
// STR creation date = date the STR/PO CSV was uploaded to the system
// (TBL_IMP_WMS_CLIENTPO_UPLOAD_CSV_LOG.MAKERDT via TBL_WMS_CLIENTPO.LOGID).
// Derives the patch from the live definition and ALTERs in place - column
// addition only, parameters unchanged, so existing callers are unaffected.

const sql = require('mssql');
const cfg = {
  server: '180.179.207.163', port: 1433,
  user: 'jolly_a', password: 'Mpprod51', database: 'manilal',
  options: { trustServerCertificate: true, encrypt: false },
  requestTimeout: 300000,
};

function replaceOnce(def, find, replace, label) {
  const parts = def.split(find);
  if (parts.length !== 2) throw new Error(`${label}: expected exactly 1 match, got ${parts.length - 1}`);
  return parts.join(replace);
}

(async () => {
  const pool = await sql.connect(cfg);
  const r = await pool.request()
    .query(`SELECT OBJECT_DEFINITION(OBJECT_ID('USP_WMS_DASHBOARD_V3')) AS def`);
  let def = r.recordset[0].def;
  if (!def) throw new Error('USP_WMS_DASHBOARD_V3 not found');
  if (def.includes('STR_CREATION_DATE')) { console.log('already patched, nothing to do'); return pool.close(); }

  def = replaceOnce(def,
    'PO_QTY             = SUM(CONVERT(INT, PO.QTY)),',
    `STR_CREATION_DATE  = ISNULL(CONVERT(VARCHAR(10), MIN(L.MAKERDT), 103), ''),\r\n        PO_QTY             = SUM(CONVERT(INT, PO.QTY)),`,
    'RS12 column insert');

  def = replaceOnce(def,
    'LEFT JOIN #PO_DISPATCHED PD ON PD.PONO = PO.PONO',
    'LEFT JOIN #PO_DISPATCHED PD ON PD.PONO = PO.PONO\r\n    LEFT JOIN TBL_IMP_WMS_CLIENTPO_UPLOAD_CSV_LOG L ON L.PK_ID = PO.LOGID',
    'RS12 join insert');

  def = def.replace(/CREATE\s+PROCEDURE/i, 'ALTER PROCEDURE');

  await pool.request().batch(def);
  console.log('USP_WMS_DASHBOARD_V3 RS12 now includes STR_CREATION_DATE.');

  // sanity: run it and show RS12 head
  const t = await pool.request()
    .input('CMPCODE',  sql.VarChar(2),  '01')
    .input('CITYCODE', sql.VarChar(3),  'MUM')
    .input('ASONDATE', sql.VarChar(10), new Date().toLocaleDateString('en-GB'))
    .execute('USP_WMS_DASHBOARD_V3');
  const rs12 = t.recordsets[11];
  console.log(`RS12 rows: ${rs12.length}`);
  rs12.slice(0, 3).forEach(row => console.log(JSON.stringify(row)));

  await pool.close();
})().catch(e => { console.error(e.message); process.exit(1); });
