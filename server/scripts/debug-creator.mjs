import dotenv from 'dotenv'
import fs from 'fs'
import jwt from 'jsonwebtoken'
dotenv.config({ path: './.env' })
const SECRET = fs.readFileSync('./.env','utf8').match(/^JWT_SECRET=(.*)$/m)[1]
const mk = (uid) => jwt.sign({ id: uid }, SECRET, { expiresIn: '1h' })
const U_ADMIN = 'a338abb0-da7a-480c-aa12-5186602cf3a8'
const BASE = 'http://127.0.0.1:3030/api'
async function api(uid, path, opts={}) {
  const r = await fetch(BASE+path, {...opts, headers:{Authorization:`Bearer ${mk(uid)}`, ...(opts.headers||{})}})
  return r.json()
}
const adminMe = await api(U_ADMIN, '/admin/me')
console.log('Admin me:', JSON.stringify(adminMe, null, 2))

const apps = await api(U_ADMIN, '/admin/creator-applications?status=pending')
console.log('Pending apps:', JSON.stringify(apps, null, 2))

const listCreators = await api(U_ADMIN, '/creator/public')
console.log('Public creators:', JSON.stringify(listCreators, null, 2).slice(0, 500))
