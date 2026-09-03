import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

import pool from '../config/database.js'

async function main() {
  const { rows } = await pool.query('SELECT id, email, name, role FROM users WHERE role = $1', ['admin'])
  console.log('Admin users:', rows)
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
