// Reverts USP_WMS_DASHBOARD_V3 to the pre-v3.4 definition (25 result sets)
// using the in-DB backup USP_WMS_DASHBOARD_V3_BKUP_20260717.
// File fallback: USP_WMS_DASHBOARD_V3.live_backup_20260717.sql
// (change CREATE -> ALTER and run it against the live proc name).

const sql = require('mssql');

const cfg = {
  server: '180.179.207.163', port: 1433,
  user: 'jolly_a', password: 'Mpprod51', database: 'manilal',
  options: { trustServerCertificate: true, encrypt: false },
  requestTimeout: 300000,
};

const BACKUP = 'USP_WMS_DASHBOARD_V3_BKUP_20260717';

(async () => {
  const pool = await sql.connect(cfg);
  const r = await pool.request().query(
    `SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.${BACKUP}')) AS def`);
  const def = r.recordset[0].def;
  if (!def) throw new Error(`backup proc ${BACKUP} not found`);
  const revertDef = def.replace(
    new RegExp(`CREATE\\s+PROCEDURE\\s+\\[dbo\\]\\.\\[${BACKUP}\\]`, 'i'),
    'ALTER PROCEDURE [dbo].[USP_WMS_DASHBOARD_V3]');
  await pool.request().batch(revertDef);
  console.log('USP_WMS_DASHBOARD_V3 reverted to pre-v3.4 definition (25 result sets)');
  await pool.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
