// One-time, idempotent: creates the table behind the dashboard's sign-in /
// sign-up. Deliberately separate from the ERP's own `login` table — dashboard
// accounts never grant ERP access and ERP logins are never touched.
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

// USERNAME uniqueness is case-insensitive: the DB collation is SQL_Latin1_General_CP1_CI_AS.
const DDL = `
IF OBJECT_ID('dbo.TBL_WMS_AUTH_USERS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TBL_WMS_AUTH_USERS (
    ID            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TBL_WMS_AUTH_USERS PRIMARY KEY,
    USERNAME      VARCHAR(50)   NOT NULL CONSTRAINT UQ_TBL_WMS_AUTH_USERS_USERNAME UNIQUE,
    FULLNAME      NVARCHAR(100) NOT NULL,
    PASSWORD_HASH VARCHAR(100)  NOT NULL,   -- bcrypt
    ROLE          VARCHAR(20)   NOT NULL CONSTRAINT DF_TBL_WMS_AUTH_USERS_ROLE    DEFAULT ('user'),
    IS_ACTIVE     BIT           NOT NULL CONSTRAINT DF_TBL_WMS_AUTH_USERS_ACTIVE  DEFAULT (1),
    CREATED_AT    DATETIME      NOT NULL CONSTRAINT DF_TBL_WMS_AUTH_USERS_CREATED DEFAULT (GETDATE()),
    LAST_LOGIN_AT DATETIME      NULL
  );
  PRINT 'Created dbo.TBL_WMS_AUTH_USERS';
END
ELSE
  PRINT 'dbo.TBL_WMS_AUTH_USERS already exists - nothing to do';
`;

(async () => {
  const pool = await new sql.ConnectionPool({
    server:   process.env.MSSQL_MANILAL_HOST,
    port:     parseInt(process.env.MSSQL_MANILAL_PORT || '1433'),
    user:     process.env.MSSQL_MANILAL_USER,
    password: process.env.MSSQL_MANILAL_PASSWORD,
    database: process.env.MSSQL_MANILAL_DATABASE,
    options:  { encrypt: false, trustServerCertificate: true },
  }).connect();

  const request = pool.request();
  request.on('info', m => console.log(m.message));
  await request.query(DDL);

  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH AS LEN, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'TBL_WMS_AUTH_USERS'
    ORDER BY ORDINAL_POSITION`);
  console.table(cols.recordset);
  await pool.close();
})().catch(err => { console.error(err.message); process.exit(1); });
