// Idempotent: creates the table behind the dashboard's sign-in / sign-up, or
// upgrades an existing one. Deliberately separate from the ERP's own `login`
// table — dashboard accounts never grant ERP access and ERP logins are never touched.
//
//   node scripts/create_auth_table.js
//
// Uses the same MSSQL_MANILAL_* variables as lib/db.ts, read from .env.
const fs   = require('fs');
const path = require('path');
const sql  = require('mssql');

for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

// Each step runs as its own batch, so later steps compile against columns the
// earlier ones add. USERNAME uniqueness is case-insensitive: the DB collation
// is SQL_Latin1_General_CP1_CI_AS.
const STEPS = [
  `IF OBJECT_ID('dbo.TBL_WMS_AUTH_USERS', 'U') IS NULL
   BEGIN
     CREATE TABLE dbo.TBL_WMS_AUTH_USERS (
       ID            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TBL_WMS_AUTH_USERS PRIMARY KEY,
       USERNAME      VARCHAR(50)   NOT NULL CONSTRAINT UQ_TBL_WMS_AUTH_USERS_USERNAME UNIQUE,
       FULLNAME      NVARCHAR(100) NOT NULL,
       PASSWORD_HASH VARCHAR(100)  NOT NULL,   -- bcrypt
       ROLE          VARCHAR(20)   NOT NULL CONSTRAINT DF_TBL_WMS_AUTH_USERS_ROLE    DEFAULT ('user'),
       IS_ACTIVE      BIT          NOT NULL CONSTRAINT DF_TBL_WMS_AUTH_USERS_ACTIVE  DEFAULT (0),
       CREATED_AT     DATETIME     NOT NULL CONSTRAINT DF_TBL_WMS_AUTH_USERS_CREATED DEFAULT (GETDATE()),
       LAST_LOGIN_AT  DATETIME     NULL,
       APPROVED_AT    DATETIME     NULL,       -- NULL while inactive = sign-up waiting for approval
       APPROVED_BY    INT          NULL,       -- ID of the approving admin
       MUST_CHANGE_PW BIT          NOT NULL CONSTRAINT DF_TBL_WMS_AUTH_USERS_MUSTCHG DEFAULT (0),
       PASSWORD_CHANGED_AT DATETIME NULL
     );
     PRINT 'Created dbo.TBL_WMS_AUTH_USERS';
   END`,

  // v2 — admin approval of sign-ups
  `IF COL_LENGTH('dbo.TBL_WMS_AUTH_USERS', 'APPROVED_AT') IS NULL
   BEGIN
     ALTER TABLE dbo.TBL_WMS_AUTH_USERS ADD APPROVED_AT DATETIME NULL, APPROVED_BY INT NULL;
     PRINT 'Added APPROVED_AT / APPROVED_BY';
   END`,
  `UPDATE dbo.TBL_WMS_AUTH_USERS SET APPROVED_AT = CREATED_AT WHERE IS_ACTIVE = 1 AND APPROVED_AT IS NULL;
   IF @@ROWCOUNT > 0 PRINT 'Marked existing active accounts as approved';`,
  `IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_TBL_WMS_AUTH_USERS_ACTIVE' AND definition <> '((0))')
   BEGIN
     ALTER TABLE dbo.TBL_WMS_AUTH_USERS DROP CONSTRAINT DF_TBL_WMS_AUTH_USERS_ACTIVE;
     ALTER TABLE dbo.TBL_WMS_AUTH_USERS ADD CONSTRAINT DF_TBL_WMS_AUTH_USERS_ACTIVE DEFAULT (0) FOR IS_ACTIVE;
     PRINT 'New accounts now default to inactive';
   END`,

  // v3 — admin password reset (force-change on next sign-in)
  `IF COL_LENGTH('dbo.TBL_WMS_AUTH_USERS', 'MUST_CHANGE_PW') IS NULL
   BEGIN
     ALTER TABLE dbo.TBL_WMS_AUTH_USERS
       ADD MUST_CHANGE_PW BIT NOT NULL CONSTRAINT DF_TBL_WMS_AUTH_USERS_MUSTCHG DEFAULT (0);
     PRINT 'Added MUST_CHANGE_PW';
   END`,
  `IF COL_LENGTH('dbo.TBL_WMS_AUTH_USERS', 'PASSWORD_CHANGED_AT') IS NULL
   BEGIN
     ALTER TABLE dbo.TBL_WMS_AUTH_USERS ADD PASSWORD_CHANGED_AT DATETIME NULL;
     PRINT 'Added PASSWORD_CHANGED_AT';
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
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'TBL_WMS_AUTH_USERS'
    ORDER BY ORDINAL_POSITION`);
  console.table(cols.recordset);
  await pool.close();
})().catch(err => { console.error(err.message); process.exit(1); });
