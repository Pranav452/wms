// Smoke-test USP_WMS_KIABI_REPORTS: run without range (all-time) and with a
// June-July 2026 window; print counts and sample rows of every recordset.
const sql = require('mssql');
const cfg = {
  server: '180.179.207.163', port: 1433,
  user: 'jolly_a', password: 'Mpprod51', database: 'manilal',
  options: { trustServerCertificate: true, encrypt: false },
  requestTimeout: 300000,
};

const NAMES = ['META', 'RANGE KPI', 'STR TRACKING', 'RTV SUMMARY', 'RTV EAN DETAIL', 'DAILY FLOW'];

async function run(pool, from, to) {
  console.log(`\n########## FROMDATE='${from}' TODATE='${to}' ##########`);
  const r = await pool.request()
    .input('CMPCODE',  sql.VarChar(2),  '01')
    .input('CITYCODE', sql.VarChar(3),  'MUM')
    .input('FROMDATE', sql.VarChar(10), from)
    .input('TODATE',   sql.VarChar(10), to)
    .execute('USP_WMS_KIABI_REPORTS');
  r.recordsets.forEach((rs, i) => {
    console.log(`\n--- RS${i + 1} ${NAMES[i]} (${rs.length} rows) ---`);
    rs.slice(0, i === 1 || i === 0 ? 1 : 5).forEach(row => console.log(JSON.stringify(row)));
    if (rs.length > 5) console.log(`... ${rs.length - 5} more`);
  });
}

(async () => {
  const pool = await sql.connect(cfg);
  await run(pool, '', '');                        // all-time
  await run(pool, '01/06/2026', '10/07/2026');    // KIABI-style window
  await pool.close();
})().catch(e => { console.error(e.message); process.exit(1); });
