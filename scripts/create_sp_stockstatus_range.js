// Creates USP_WMS_SHIPMENTWISE_STOCK_STATUS_ALL_MRPQTY_RANGE - a copy of
// USP_WMS_SHIPMENTWISE_STOCK_STATUS_ALL_MRPQTY with an optional @FROMDATE param
// so the stock report can cover a date range instead of a single as-on date.
//
// A separate SP (not an ALTER of the original) because the WebApi's DAL
// (AssignParameterValues) requires the value count to exactly match the SP's
// parameter count - adding a param to the original would break its existing
// 3-value callers (the ERP's sync endpoint and the _START job endpoint).
//
// Derives the new SP from the live definition at run time and rewrites:
//   - the procedure name
//   - the parameter list (adds @FROMDATE VARCHAR(10) = '')
//   - every `CONVERT(..., 103) <= @TDATE` date filter gains a matching
//     `AND (@FDATE IS NULL OR ... >= @FDATE)` lower bound
//   - the report header line shows the range when @FROMDATE is given
// When @FROMDATE is '' the SP behaves exactly like the original.

const sql = require('mssql');
const cfg = {
  server: '180.179.207.163', port: 1433,
  user: 'jolly_a', password: 'Mpprod51', database: 'manilal',
  options: { trustServerCertificate: true, encrypt: false },
  requestTimeout: 300000,
};

const SRC = 'USP_WMS_SHIPMENTWISE_STOCK_STATUS_ALL_MRPQTY';
const DST = 'USP_WMS_SHIPMENTWISE_STOCK_STATUS_ALL_MRPQTY_RANGE';

(async () => {
  const pool = await sql.connect(cfg);

  const r = await pool.request()
    .input('name', sql.VarChar, SRC)
    .query('SELECT OBJECT_DEFINITION(OBJECT_ID(@name)) AS def');
  let def = r.recordset[0].def;
  if (!def) throw new Error(`Source SP ${SRC} not found`);

  // 1. Rename
  const created = def.replace(
    /CREATE\s+PROCEDURE\s+\[dbo\]\.\[USP_WMS_SHIPMENTWISE_STOCK_STATUS_ALL_MRPQTY\]/i,
    `CREATE PROCEDURE [dbo].[${DST}]`
  );
  if (created === def) throw new Error('rename replacement did not match');
  def = created;

  // 2. Add @FROMDATE parameter after @ASONDATE
  const withParam = def.replace(
    /(@ASONDATE\s+VARCHAR\(10\))(\s*--[^\r\n]*)/i,
    `$1,$2\r\n    @FROMDATE  VARCHAR(10) = ''   -- optional dd/MM/yyyy; '' = plain as-on behaviour`
  );
  if (withParam === def) throw new Error('param replacement did not match');
  def = withParam;

  // 3. Declare and set @FDATE next to @TDATE
  const withFdate = def.replace(
    /(SET\s+@TDATE\s*=\s*CONVERT\(DATETIME,\s*@ASONDATE,\s*103\);)/i,
    `$1\r\n\r\n    DECLARE @FDATE DATETIME;\r\n    SET @FDATE = CASE WHEN ISNULL(@FROMDATE,'') = '' THEN NULL ELSE CONVERT(DATETIME, @FROMDATE, 103) END;`
  );
  if (withFdate === def) throw new Error('@FDATE declaration replacement did not match');
  def = withFdate;

  // 4. Every upper-bound date filter gains an optional lower bound
  let filterCount = 0;
  def = def.replace(
    /convert\s*\(\s*(date|datetime)\s*,\s*([A-Za-z0-9_.]+)\s*,\s*103\s*\)\s*<=\s*@TDATE/gi,
    (m, kind, col) => {
      filterCount++;
      return `${m} AND (@FDATE IS NULL OR CONVERT(${kind.toUpperCase()}, ${col}, 103) >= @FDATE)`;
    }
  );
  // 9 known <= @TDATE filters in the original SP; refuse to proceed if the
  // shape changed so we don't silently create a half-filtered range SP.
  if (filterCount !== 9) throw new Error(`expected 9 date-filter replacements, got ${filterCount}`);

  // 5. Header line reflects the range
  const withHeader = def.replace(
    /'STOCK STATUS AS ON DATE  '\s*\+\s*@asondate\s+HEADER/i,
    `CASE WHEN @FDATE IS NULL THEN 'STOCK STATUS AS ON DATE  ' + @ASONDATE ELSE 'STOCK STATUS FROM ' + @FROMDATE + ' TO ' + @ASONDATE END HEADER`
  );
  if (withHeader === def) throw new Error('header replacement did not match');
  def = withHeader;

  await pool.request().batch(`IF OBJECT_ID('dbo.${DST}') IS NOT NULL DROP PROCEDURE dbo.${DST}`);
  await pool.request().batch(def);
  console.log(`created ${DST}`);

  const check = await pool.request().query(
    `SELECT name, TYPE_NAME(user_type_id) AS type, is_nullable, has_default_value
     FROM sys.parameters WHERE object_id = OBJECT_ID('dbo.${DST}') ORDER BY parameter_id`
  );
  console.table(check.recordset);

  await pool.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
