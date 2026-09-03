import dotenv from 'dotenv'
import fs from 'fs'
import jwt from 'jsonwebtoken'
dotenv.config({ path: './.env' })
const SECRET = fs.readFileSync('./.env','utf8').match(/^JWT_SECRET=(.*)$/m)[1]
const mk = (uid) => jwt.sign({ id: uid }, SECRET, { expiresIn: '1h' })
const BASE = 'http://127.0.0.1:3030/api'
async function api(uid, path, opts={}) {
  const r = await fetch(BASE+path, {...opts, headers:{Authorization:`Bearer ${mk(uid)}`, ...(opts.headers||{})}})
  return r.json()
}
const U1 = '48aeea13-ac62-4b83-9116-d72b521e609b'
const U2 = '31853d60-3d24-4a8c-b724-d6850547c1d8'
const U3 = 'a338abb0-da7a-480c-aa12-5186602cf3a8'

for (const [name, uid] of [['U1',U1], ['U2',U2], ['U3',U3]]) {
  const me = await api(uid, '/admin/me')
  console.log(`${name} (${uid}):`, JSON.stringify(me))
}
