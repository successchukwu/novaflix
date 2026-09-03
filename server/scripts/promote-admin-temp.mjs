// Set DATABASE_URL before any imports
process.env.DATABASE_URL = "postgresql://neondb_owner:npg_FKt3qVrQ8mPp@ep-delicate-wind-a6mgfg58-pooler.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

import pool from '../config/database.js'

const U1 = '48aeea13-ac62-4b83-9116-d72b521e609b'

async function main() {
  const before = await pool.query('SELECT id, email, name, role, creator_approved FROM users WHERE id = $1', [U1])
  console.log('Before:', before.rows[0])
  
  await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['admin', U1])
  
  const after = await pool.query('SELECT id, email, name, role, creator_approved FROM users WHERE id = $1', [U1])
  console.log('After:', after.rows[0])
  
  const roles = await pool.query('SELECT * FROM admin_roles')
  console.log('Admin roles:', roles.rows)
  
  const adminRole = roles.rows.find(r => r.slug === 'super_admin' || r.slug === 'admin')
  if (adminRole) {
    await pool.query('INSERT INTO user_admin_roles (user_id, admin_role_id) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET admin_role_id = $2', [U1, adminRole.id])
    console.log('Assigned admin role:', adminRole)
  }
  
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
