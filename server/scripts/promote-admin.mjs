import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

import pool from '../config/database.js'

const U1 = '48aeea13-ac62-4b83-9116-d72b521e609b'

async function main() {
  const { rows: before } = await pool.query('SELECT id, email, name, role, creator_approved FROM users WHERE id = $1', [U1])
  console.log('Before:', before[0])
  
  await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [U1])
  
  const { rows: after } = await pool.query('SELECT id, email, name, role, creator_approved FROM users WHERE id = $1', [U1])
  console.log('After:', after[0])
  
  const { rows: roles } = await pool.query('SELECT * FROM admin_roles')
  console.log('Admin roles:', roles)
  
  const adminRole = roles.find(r => r.slug === 'super_admin' || r.slug === 'admin')
  if (adminRole) {
    await pool.query(`INSERT INTO user_admin_roles (user_id, admin_role_id) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET admin_role_id = $2`, [U1, adminRole.id])
    console.log('Assigned admin role:', adminRole)
  }
  
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
