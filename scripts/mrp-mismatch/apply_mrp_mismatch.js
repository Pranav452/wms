// Deploys USP_WMS_DASHBOARD_V3 v3.4 (MRP mismatch additions, mail 17/07/2026):
//   1. backs up the live proc in-DB as USP_WMS_DASHBOARD_V3_BKUP_20260717
//      (file copy: USP_WMS_DASHBOARD_V3.live_backup_20260717.sql)
//   2. ALTERs V3 from USP_WMS_DASHBOARD_V3.v3_4_mrp_mismatch.sql
//   3. smoke-runs the proc and checks the new shape:
//      26 recordsets, RS12/RS22 MRP_MISMATCH_COUNT, RS21 mismatch scalars,
//      RS26 detail columns
//
// Additions are append-only (STEP 11 temp table, columns after existing ones,
// RS26 after RS25) so rs[0]..rs[24] indexing in app/api/dashboard/route.ts
// keeps working; the new detail set is rs[25].
//
// Revert: see revert_mrp_mismatch.js (recreates V3 from the 20260717 backup).

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const cfg = {
  server: '180.179.207.163', port: 1433,
  user: 'jolly_a', password: 'Mpprod51', database: 'manilal',
  options: { trustServerCertificate: true, encrypt: false },
  requestTimeout: 300000,
};

const BACKUP = 'USP_WMS_DASHBOARD_V3_BKUP_20260717';
const NEW_DEF_FILE = path.join(__dirname, 'USP_WMS_DASHBOARD_V3.v3_4_mrp_mismatch.sql');

(async () => {
  const pool = await sql.connect(cfg);

  // 1. in-DB backup of the live definition
  const cur = await pool.request().query(
    `SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.USP_WMS_DASHBOARD_V3')) AS def`);
  const liveDef = cur.recordset[0].def;
  if (!liveDef) throw new Error('live USP_WMS_DASHBOARD_V3 not found');
  if (liveDef.includes('#MRP_MM')) {
    console.log('live proc already has the MRP mismatch additions - nothing to do');
    await pool.close(); return;
  }
  const exists = await pool.request().query(
    `SELECT 1 AS x FROM sys.procedures WHERE name = '${BACKUP}'`);
  if (exists.recordset.length === 0) {
    const backupDef = liveDef.replace(
      /(CREATE|ALTER)\s+PROCEDURE\s+\[dbo\]\.\[USP_WMS_DASHBOARD_V3\]/i,
      `CREATE PROCEDURE [dbo].[${BACKUP}]`);
    await pool.request().batch(backupDef);
    console.log('backup proc created:', BACKUP);
  } else {
    console.log('backup proc already exists:', BACKUP);
  }

  // 2. ALTER to v3.4
  const newDef = fs.readFileSync(NEW_DEF_FILE, 'utf8');
  await pool.request().batch(newDef);
  console.log('ALTER applied: USP_WMS_DASHBOARD_V3 -> v3.4 (26 result sets)');

  // 3. smoke run + shape checks
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const asOn = `${dd}/${mm}/${today.getFullYear()}`;
  const t0 = Date.now();
  const res = await pool.request()
    .input('CMPCODE', sql.VarChar(2), '01')
    .input('CITYCODE', sql.VarChar(3), 'MUM')
    .input('ASONDATE', sql.VarChar(10), asOn)
    .input('FROMDATE', sql.VarChar(10), '')
    .execute('USP_WMS_DASHBOARD_V3');
  console.log(`smoke run @ASONDATE=${asOn} took ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const rs = res.recordsets;
  console.log('recordsets:', rs.length, '(expect 26)');
  const rs12 = rs[11][0] || {};
  const rs21 = rs[20][0] || {};
  const rs22 = rs[21][0] || {};
  console.log('RS12 has MRP_MISMATCH_COUNT :', 'MRP_MISMATCH_COUNT' in rs12);
  console.log('RS21 mismatch scalars       :',
    rs21.MRP_MISMATCH_EAN_COUNT, '(EANs)', rs21.MRP_MISMATCH_PO_COUNT, '(POs)');
  console.log('RS22 has MRP_MISMATCH_COUNT :', 'MRP_MISMATCH_COUNT' in rs22);
  console.log('RS26 rows                   :', rs[25].length);
  if (rs[25].length) {
    console.log('RS26 columns                :', Object.keys(rs[25][0]).join(' | '));
    const s = rs[25][0];
    console.log('RS26 sample                 :',
      s['PONO'], '|', s['EAN'], '| PO MRP', s['PO MRP'], '| LBL', String(s['WMS Label MRP']).slice(0, 40),
      '| BAL', s['Balance Qty']);
  }
  await pool.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
