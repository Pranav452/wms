// Idempotent: creates the activity log behind the admin Activity page — who
// downloaded which report, who opened which dashboard page, and when.
//
//   node scripts/create_activity_table.js
//
// Uses the same MSSQL_MANILAL_* variables as lib/db.ts, read from .env.
const fs   = require('fs');
const path = require('path');
const sql  = require('mssql');

for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

// Each step runs as its own batch, so the index steps compile against the table.
const STEPS = [
  `IF OBJECT_ID('dbo.TBL_WMS_ACTIVITY_LOG', 'U') IS NULL
   BEGIN
     CREATE TABLE dbo.TBL_WMS_ACTIVITY_LOG (
       ID         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TBL_WMS_ACTIVITY_LOG PRIMARY KEY,
       USER_ID    INT           NOT NULL,
       USERNAME   VARCHAR(50)   NOT NULL,   -- as it was at the time, so the log survives renames and deletes
       ROLE       VARCHAR(20)   NOT NULL,   -- as it was at the time: separates clients from admins
       EVENT      VARCHAR(20)   NOT NULL,   -- 'download' | 'page_view'
       TARGET     VARCHAR(100)  NOT NULL,   -- report key or page path (lib/activity/catalog.ts)
       DETAIL     NVARCHAR(400) NULL,       -- e.g. as-on date, filter, row count
       IP         VARCHAR(45)   NULL,
       USER_AGENT NVARCHAR(300) NULL,
       CREATED_AT DATETIME      NOT NULL CONSTRAINT DF_TBL_WMS_ACTIVITY_LOG_CREATED DEFAULT (GETDATE())
     );
     PRINT 'Created dbo.TBL_WMS_ACTIVITY_LOG';
   END`,
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TBL_WMS_ACTIVITY_LOG_CREATED' AND object_id = OBJECT_ID('dbo.TBL_WMS_ACTIVITY_LOG'))
   BEGIN
     CREATE INDEX IX_TBL_WMS_ACTIVITY_LOG_CREATED ON dbo.TBL_WMS_ACTIVITY_LOG (CREATED_AT);
     PRINT 'Added index on CREATED_AT';
   END`,
  // serves the "same page, same person, last few minutes" check on every page visit
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TBL_WMS_ACTIVITY_LOG_USER' AND object_id = OBJECT_ID('dbo.TBL_WMS_ACTIVITY_LOG'))
   BEGIN
     CREATE INDEX IX_TBL_WMS_ACTIVITY_LOG_USER ON dbo.TBL_WMS_ACTIVITY_LOG (USER_ID, EVENT, TARGET, CREATED_AT);
     PRINT 'Added index on USER_ID, EVENT, TARGET';
   END`,
];

(async () => {
  const pool = await new sql.ConnectionPool({
    server:   process.env.MSSQL_MANILAL_HOST,
    port:     parseInt(process.env.MSSQL_MANILAL_PORT || '1433'),
    user:     process.env.MSSQL_MANILAL_USER,
    password: process.env.MSSQL_MANILAL_PASSWORD,
    database: process.env.MSSQL_MANILAL_DATABASE,
    options:  { encrypt: false, trustServerCertificate: true },
  }).connect();

  for (const step of STEPS) {
    const request = pool.request();
    request.on('info', m => console.log(m.message));
    await request.query(step);
  }

  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH AS LEN, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'TBL_WMS_ACTIVITY_LOG'
    ORDER BY ORDINAL_POSITION`);
  console.log(cols.recordset.map(c => `${c.COLUMN_NAME} ${c.DATA_TYPE}${c.LEN ? `(${c.LEN})` : ''}`).join(', '));
  await pool.close();
})().catch(err => { console.error(err.message); process.exit(1); });
