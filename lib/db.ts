import sql from 'mssql'

const config: sql.config = {
  server:   process.env.MSSQL_MANILAL_HOST!,
  port:     parseInt(process.env.MSSQL_MANILAL_PORT || '1433'),
  user:     process.env.MSSQL_MANILAL_USER!,
  password: process.env.MSSQL_MANILAL_PASSWORD!,
  database: process.env.MSSQL_MANILAL_DATABASE!,
  options: {
    encrypt:                false,
    trustServerCertificate: true,
    enableArithAbort:       true,
  },
  connectionTimeout: 15000,
  requestTimeout:    60000,
}

let pool: sql.ConnectionPool | null = null

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool
  pool = await new sql.ConnectionPool(config).connect()
  return pool
}

export { sql }
