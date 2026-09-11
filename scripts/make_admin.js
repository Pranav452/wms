// Makes an existing dashboard account an admin, approving it if it was still
// pending. Needed once, to bootstrap the first admin — after that, admins
// manage everyone from Settings → Users & access.
//
//   node scripts/make_admin.js <username>
//
// Uses the same MSSQL_MANILAL_* variables as lib/db.ts, read from .env.
const fs   = require('fs');
const path = require('path');
const sql  = require('mssql');

for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

const username = process.argv[2];
if (!username) {
  console.error('Usage: node scripts/make_admin.js <username>');
  process.exit(1);
}

(async () => {
  const pool = await new sql.ConnectionPool({
    server:   process.env.MSSQL_MANILAL_HOST,
    port:     parseInt(process.env.MSSQL_MANILAL_PORT || '1433'),
    user:     process.env.MSSQL_MANILAL_USER,
    password: process.env.MSSQL_MANILAL_PASSWORD,
    database: process.env.MSSQL_MANILAL_DATABASE,
    options:  { encrypt: false, trustServerCertificate: true },
  }).connect();

  const result = await pool.request()
    .input('USERNAME', sql.VarChar(50), username)
    .query(`
      UPDATE dbo.TBL_WMS_AUTH_USERS
      SET ROLE = 'admin', IS_ACTIVE = 1, APPROVED_AT = ISNULL(APPROVED_AT, GETDATE())
      OUTPUT INSERTED.ID, INSERTED.USERNAME, INSERTED.FULLNAME, INSERTED.ROLE, INSERTED.IS_ACTIVE
      WHERE USERNAME = @USERNAME`);

  if (result.recordset.length) {
    console.log('Admin now:', result.recordset[0]);
  } else {
    console.error(`No account "${username}" — request one at /signup first, then re-run this.`);
    process.exitCode = 1;
  }
  await pool.close();
})().catch(err => { console.error(err.message); process.exit(1); });
