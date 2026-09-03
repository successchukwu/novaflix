import pool from '../config/database.js'
import { getAllUsers, getPlatformStats, getAllUploads, findUserById, updateUser, getAllNewsletterEmails, getUsersByPlans, getUsersByRoles, createNotificationsBulk } from '../db.js'
import { sendNewsletterEmail, sendAnnouncementEmail } from '../services/emailService.js'
import { notifyUser, broadcastFeed } from '../services/realtime.js'
import { pushToUsers } from '../services/pushService.js'
import { PERMISSIONS } from '../lib/permissions.js'
import {
  getAdminRoles, createAdminRole, updateAdminRole, deleteAdminRole,
  assignAdminRole, clearAdminRole,
} from '../db.js'

// ============ RBAC (Admin Roles & Permissions) ============

export async function listPermissions(req, res) {
  res.json({ success: true, permissions: PERMISSIONS })
}

export async function getAdminMe(req, res) {
  try {
    const permissions = req.permissions || []
    const roleId = req.user?.admin_role_id || null
    let slug = req.adminRoleSlug || null
    let roleName = null
    if (roleId) {
      const { rows } = await (await import('../db.js')).pool.query('SELECT name, slug FROM admin_roles WHERE id = $1', [roleId])
      roleName = rows[0]?.name || null
      slug = rows[0]?.slug || slug
    }
    res.json({ success: true, permissions, roleId, slug, roleName })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function listRoles(req, res) {
  try {
    const roles = await getAdminRoles()
    res.json({ success: true, roles })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function createRole(req, res) {
  try {
    const { name, slug, description, permissions } = req.body
    if (!name || !slug) return res.status(400).json({ error: 'name and slug required' })
    const role = await createAdminRole({ name, slug, description: description || '', permissions: permissions || [] })
    await logAdminAudit({ actorId: req.userId, action: 'role.create', entity: 'admin_role', entityId: role.id, meta: { name: role.name, slug: role.slug } })
    broadcastFeed({ type: 'admin:role.created', role: { id: role.id, name: role.name, slug: role.slug }, timestamp: Date.now() })
    res.json({ success: true, role })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function updateRole(req, res) {
  try {
    const { id } = req.params
    const role = await updateAdminRole(id, {
      name: req.body.name, description: req.body.description || '', permissions: req.body.permissions || [],
    })
    if (!role) return res.status(400).json({ error: 'System roles cannot be edited' })
    await logAdminAudit({ actorId: req.userId, action: 'role.update', entity: 'admin_role', entityId: id, meta: { name: role.name } })
    broadcastFeed({ type: 'admin:role.updated', role: { id: role.id, name: role.name }, timestamp: Date.now() })
    res.json({ success: true, role })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function removeRole(req, res) {
  try {
    const { id } = req.params
    const removed = await deleteAdminRole(id)
    if (!removed) return res.status(400).json({ error: 'System roles cannot be deleted' })
    await logAdminAudit({ actorId: req.userId, action: 'role.delete', entity: 'admin_role', entityId: id })
    broadcastFeed({ type: 'admin:role.deleted', roleId: id, timestamp: Date.now() })
    res.json({ success: true, message: 'Role deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function assignRole(req, res) {
  try {
    const { id } = req.params
    const { adminRoleId } = req.body
    const user = await findUserById(id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (adminRoleId) {
      await assignAdminRole(id, adminRoleId)
    } else {
      await clearAdminRole(id)
    }
    await logAdminAudit({ actorId: req.userId, action: 'role.assign', entity: 'user', entityId: id, meta: { adminRoleId } })
    broadcastFeed({ type: 'admin:user.role.assigned', userId: id, adminRoleId, timestamp: Date.now() })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function seedRoles() {
  const { DEFAULT_ROLES } = await import('../lib/permissions.js')
  for (const role of DEFAULT_ROLES) {
    await createAdminRole(role).catch(() => {})
  }
}

export async function getUsers(req, res) {
  try {
    const users = await getAllUsers()
    const safe = users.map(u => ({ ...u, password: undefined }))
    res.json({ success: true, users: safe })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getUser(req, res) {
  try {
    const user = await findUserById(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const safe = { ...user, password: undefined }
    res.json({ success: true, user: safe })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function updateUserRole(req, res) {
  try {
    const { role } = req.body
    if (!['user', 'creator', 'admin', 'banned'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' })
    }
    const updated = await updateUser(req.params.id, { role })
    if (!updated) return res.status(404).json({ error: 'User not found' })
    const safe = { ...updated, password: undefined }
    broadcastFeed({ type: 'admin:user.role.changed', userId: req.params.id, role, timestamp: Date.now() })
    res.json({ success: true, user: safe })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function banUser(req, res) {
  try {
    const user = await findUserById(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const reason = (req.body && req.body.reason) || ''
    await updateUser(req.params.id, { role: 'banned', banned_reason: reason, banned_at: new Date().toISOString() })
    await logAdminAudit({ actorId: req.userId, action: 'user.ban', entity: 'user', entityId: req.params.id, meta: { reason } })
    const bannedUser = await findUserById(req.params.id)
    broadcastFeed({ type: 'admin:user.banned', userId: req.params.id, reason, timestamp: Date.now() })
    res.json({ success: true, message: 'User banned', user: { ...bannedUser, password: undefined } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function unbanUser(req, res) {
  try {
    const user = await findUserById(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    await updateUser(req.params.id, { role: 'user', banned_reason: null, banned_at: null })
    await logAdminAudit({ actorId: req.userId, action: 'user.unban', entity: 'user', entityId: req.params.id })
    const unbannedUser = await findUserById(req.params.id)
    broadcastFeed({ type: 'admin:user.unbanned', userId: req.params.id, timestamp: Date.now() })
    res.json({ success: true, message: 'User unbanned', user: { ...unbannedUser, password: undefined } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function suspendUser(req, res) {
  try {
    const user = await findUserById(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const { until, reason } = req.body || {}
    if (!until || isNaN(new Date(until).getTime())) {
      return res.status(400).json({ error: 'Valid until date required' })
    }
    await updateUser(req.params.id, { suspended_until: new Date(until).toISOString(), suspension_reason: reason || '' })
    await logAdminAudit({ actorId: req.userId, action: 'user.suspend', entity: 'user', entityId: req.params.id, meta: { until, reason } })
    const suspendedUser = await findUserById(req.params.id)
    broadcastFeed({ type: 'admin:user.suspended', userId: req.params.id, until, reason, timestamp: Date.now() })
    res.json({ success: true, message: 'User suspended', user: { ...suspendedUser, password: undefined } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function unsuspendUser(req, res) {
  try {
    const user = await findUserById(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    await updateUser(req.params.id, { suspended_until: null, suspension_reason: null })
    await logAdminAudit({ actorId: req.userId, action: 'user.unsuspend', entity: 'user', entityId: req.params.id })
    const unsuspendedUser = await findUserById(req.params.id)
    broadcastFeed({ type: 'admin:user.unsuspended', userId: req.params.id, timestamp: Date.now() })
    res.json({ success: true, message: 'User unsuspended', user: { ...unsuspendedUser, password: undefined } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function verifyUser(req, res) {
  try {
    const user = await findUserById(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    await updateUser(req.params.id, { verified: true })
    await logAdminAudit({ actorId: req.userId, action: 'user.verify', entity: 'user', entityId: req.params.id })
    const verifiedUser = await findUserById(req.params.id)
    broadcastFeed({ type: 'admin:user.verified', userId: req.params.id, timestamp: Date.now() })
    res.json({ success: true, message: 'User verified', user: { ...verifiedUser, password: undefined } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function unverifyUser(req, res) {
  try {
    const user = await findUserById(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    await updateUser(req.params.id, { verified: false })
    await logAdminAudit({ actorId: req.userId, action: 'user.unverify', entity: 'user', entityId: req.params.id })
    const unverifiedUser = await findUserById(req.params.id)
    broadcastFeed({ type: 'admin:user.unverified', userId: req.params.id, timestamp: Date.now() })
    res.json({ success: true, message: 'User unverified', user: { ...unverifiedUser, password: undefined } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getStats(req, res) {
  try {
    const stats = await getPlatformStats()
    res.json({ success: true, stats })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getUploads(req, res) {
  try {
    const uploads = await getAllUploads()
    res.json({ success: true, uploads })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getCreators(req, res) {
  try {
    const { getUsersByRole } = await import('../db.js')
    const creators = await getUsersByRole('creator')
    const safe = creators.map(u => ({ ...u, password: undefined }))
    res.json({ success: true, creators: safe })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function sendNewsletter(req, res) {
  try {
    const { subject, content } = req.body
    if (!subject || !content) return res.status(400).json({ error: 'Subject and content required' })

    const subscribers = await getAllNewsletterEmails()
    if (subscribers.length === 0) return res.json({ success: true, message: 'No subscribers', sent: 0 })

    const results = await Promise.allSettled(
      subscribers.map(s => sendNewsletterEmail(s.email, s.email.split('@')[0], subject, content))
    )
    const sent = results.filter(r => r.status === 'fulfilled').length

    res.json({ success: true, message: `Newsletter sent to ${sent}/${subscribers.length} subscribers`, sent })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getNewsletterSubscribers(req, res) {
  try {
    const subscribers = await getAllNewsletterEmails()
    res.json({ success: true, subscribers })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function sendAnnouncement(req, res) {
  try {
    const { title, body, link, target = 'all', plan, role, userId } = req.body
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' })
    if (title.length > 140) return res.status(400).json({ error: 'Title must be 140 characters or fewer' })
    if (!body || !body.trim()) return res.status(400).json({ error: 'Body required' })
    if (body.length > 2000) return res.status(400).json({ error: 'Body must be 2000 characters or fewer' })
    if (link && !/^(\/|https?:\/\/)/.test(link)) return res.status(400).json({ error: 'Link must be a deeplink or absolute URL' })

    let recipients = []
    if (target === 'user') {
      if (!userId) return res.status(400).json({ error: 'userId required for target=user' })
      const u = await findUserById(userId)
      if (!u) return res.status(404).json({ error: 'User not found' })
      recipients = [u]
    } else if (target === 'plan') {
      if (!plan) return res.status(400).json({ error: 'plan required for target=plan' })
      recipients = await getUsersByPlans([plan])
    } else if (target === 'role') {
      if (!role) return res.status(400).json({ error: 'role required for target=role' })
      recipients = await getUsersByRoles([role])
    } else if (target === 'all') {
      recipients = (await getAllUsers()).filter((u) => u.role !== 'banned')
    } else {
      return res.status(400).json({ error: 'Invalid target' })
    }

    recipients = recipients.filter((u) => u && u.role !== 'banned')

    const payload = { type: 'announcement', notification: { type: 'announcement', title: title.trim(), body, link: link || '/', is_read: false } }

    const saved = await createNotificationsBulk(recipients, {
      type: 'announcement',
      title: title.trim(),
      body,
      link: link || '/',
      actorId: req.userId,
    })

    const savedByUser = new Map(saved.map((n) => [n.user_id, n]))

    let notified = 0
    let pushed = 0
    let emailed = 0
    const pushIds = []
    const emailRecipients = []

    for (const recipient of recipients) {
      if (!recipient || !recipient.id) continue
      const row = savedByUser.get(recipient.id)
      if (!row) continue

      const wsDelivered = notifyUser(recipient.id, { type: 'notification', notification: { ...payload.notification, id: row.id, created_at: row.created_at, actor_id: row.actor_id } })
      if (wsDelivered) notified++

      if (!wsDelivered && recipient.email && recipient.email_verified) {
        emailRecipients.push(recipient)
      } else {
        pushIds.push(recipient.id)
      }
    }

    if (pushIds.length > 0) {
      pushed = await pushToUsers(pushIds, {
        title: title.trim(),
        body,
        url: link || '/',
        tag: 'novaflix-announcement',
        data: { type: 'announcement', link: link || '/' },
      })
    }

    // Fire-and-forget emails so the request returns promptly; a user online via WS
    // or with a push subscription already received the notification in-app.
    for (const r of emailRecipients) {
      sendAnnouncementEmail(r.email, r.name, { title: title.trim(), body, link: link || '/' }).catch(() => {})
    }
    emailed = emailRecipients.length

    res.json({
      success: true,
      message: `Announcement sent to ${recipients.length} recipient(s)`,
      recipients: recipients.length,
      notified,
      pushed,
      emailed,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ============ Admin Platform (v2) ============

import {
  getOverview as dbGetOverview,
  getRevenueBySeries, getSignupsByDay, getWatchMinutesByDay, getRevenueByType,
  getSubscriberPlanBreakdown, getChurnStats, getPlanCounts, getTopViewsByType,
  getAdminSessionsCount, adminListUploads, adminUpdateUpload, getAllShorts,
  getAllTransactions, getAllSubscriptions, createPromoCode, listPromoCodes,
  updatePromoCode, deletePromoCode, getPromoCodeById,
  listBanners, createBanner, listAudioLibrary, createAudioTrack,
  getFeedSettingsAll, setFeedSettings, listCreatorApplications,
  getForumModerationItems, updateReportStatus, deleteReview,
  logAdminAudit, getRecentAdminActivity,
} from '../db.js'

export async function overview(req, res) {
  try {
    const [stats, revenueSeries, signups, watch, top, planBreakdown, churn, planCounts, live, activity] = await Promise.all([
      dbGetOverview(),
      getRevenueBySeries(30),
      getSignupsByDay(30),
      getWatchMinutesByDay(30),
      getTopViewsByType(10),
      getSubscriberPlanBreakdown(),
      getChurnStats(),
      getPlanCounts(),
      getAdminSessionsCount(),
      getRecentAdminActivity(12),
    ])
    res.json({ success: true, stats, revenueSeries, signups, watch, top, planBreakdown, churn, planCounts, live, activity })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function analytics(req, res) {
  try {
    const [revenueSeries, signups, watch, byType, planBreakdown, churn, live, uptime] = await Promise.all([
      getRevenueBySeries(60).catch(() => []),
      getSignupsByDay(60).catch(() => []),
      getWatchMinutesByDay(60).catch(() => []),
      getRevenueByType(20).catch(() => []),
      getSubscriberPlanBreakdown().catch(() => []),
      getChurnStats().catch(() => ({ churned: 0, active: 0 })),
      getAdminSessionsCount().catch(() => 0),
      Promise.resolve(process.uptime()),
    ])
    res.json({ success: true, revenueSeries, signups, watch, byType, planBreakdown, churn, live, uptime })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function listCatalog(req, res) {
  try {
    const { search, status, type } = req.query
    const [uploads, shorts] = await Promise.all([
      adminListUploads({ search, status: type === 'shorts' ? undefined : status, limit: 200 }),
      type === 'movie' ? getAllShorts({ search, limit: 0 }) : getAllShorts({ search, limit: 0 }),
    ])
    const uploadItems = uploads.map(u => ({ id: u.id, kind: 'movie', title: u.title, thumbnail: u.thumbnail_url || u.artwork?.poster, genre: u.genre, status: u.status, views: u.views, revenue: u.revenue, created_at: u.created_at, owner: u.owner_name }))
    const shortItems = shorts.map(s => ({ id: s.id, kind: 'short', title: s.title, thumbnail: s.thumbnail_url, status: s.status, views: s.views, revenue: s.revenue, created_at: s.created_at, owner: s.owner_name }))
    let items = type === 'shorts' ? shortItems : type === 'movie' ? uploadItems : [...uploadItems, ...shortItems]
    res.json({ success: true, items })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function updateCatalogItem(req, res) {
  try {
    const { kind, id } = req.params
    const fields = req.body
    let updated
    if (kind === 'upload') updated = await adminUpdateUpload(id, fields)
    else return res.status(400).json({ error: 'Only uploads editable' })
    await logAdminAudit({ actorId: req.userId, action: 'catalog.update', entity: 'upload', entityId: id, meta: fields })
    broadcastFeed({ type: 'admin:catalog.updated', kind, id, fields, timestamp: Date.now() })
    res.json({ success: true, item: updated })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function transactions(req, res) {
  try {
    const rows = await getAllTransactions({ limit: 200 })
    res.json({ success: true, transactions: rows })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function subscriptions(req, res) {
  try {
    const rows = await getAllSubscriptions()
    res.json({ success: true, subscriptions: rows })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function promoList(req, res) {
  try {
    const codes = await listPromoCodes()
    res.json({ success: true, codes })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function promoCreate(req, res) {
  try {
    const { code, plan, discountType = 'pct', discountValue = 0, maxUses = 0, expiresAt = null, minAmount = 0, applyToAllPlans = false, allowedIps = [], allowedPhones = [], country = null, startsAt = null, usagePerUser = 0, mode = 'one_time' } = req.body
    if (!code) return res.status(400).json({ error: 'code required' })
    const created = await createPromoCode({ code: String(code).toUpperCase(), plan, discountType, discountValue, maxUses, expiresAt, minAmount, applyToAllPlans, allowedIps, allowedPhones, country, startsAt, usagePerUser, mode })
    if (!created) return res.status(409).json({ error: 'Code already exists' })
    await logAdminAudit({ actor: req.userId, action: 'promo.create', entity: 'promo', entityId: created.id })
    broadcastFeed({ type: 'admin:promo.created', promo: created, timestamp: Date.now() })
    res.json({ success: true, code: created })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function promoUpdate(req, res) {
  try {
    const { id } = req.params
    const updates = req.body
    const updated = await updatePromoCode(id, updates)
    if (!updated) return res.status(404).json({ error: 'Promo code not found' })
    await logAdminAudit({ actor: req.userId, action: 'promo.update', entity: 'promo', entityId: id })
    broadcastFeed({ type: 'admin:promo.updated', promo: updated, timestamp: Date.now() })
    res.json({ success: true, code: updated })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function promoDelete(req, res) {
  try {
    const { id } = req.params
    await deletePromoCode(id)
    await logAdminAudit({ actor: req.userId, action: 'promo.delete', entity: 'promo', entityId: id })
    broadcastFeed({ type: 'admin:promo.deleted', promoId: id, timestamp: Date.now() })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function promoStats(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT pc.*, 
        (SELECT COUNT(*) FROM promo_redemptions WHERE promo_id = pc.id) as redemptions,
        (SELECT SUM(original_amount) FROM promo_redemptions WHERE promo_id = pc.id) as total_original,
        (SELECT SUM(discounted_amount) FROM promo_redemptions WHERE promo_id = pc.id) as total_discounted
       FROM promo_codes pc ORDER BY pc.created_at DESC`
    )
    res.json({ success: true, codes: rows })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function promotionsSettingsGet(req, res) {
  try {
    const rows = await getFeedSettingsAll()
    const settings = {}
    for (const r of rows) settings[r.key] = r.value
    res.json({ success: true, settings })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function promotionsSettingsPut(req, res) {
  try {
    const { key, value } = req.body
    if (!key) return res.status(400).json({ error: 'key required' })
    await setFeedSettings(key, value || {})
    await logAdminAudit({ actor: req.userId, action: 'promotions.settings', entity: 'promotions_settings', meta: { key } })
    broadcastFeed({ type: 'admin:promotions.settings.changed', key, value, timestamp: Date.now() })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function bannerList(req, res) {
  try { res.json({ success: true, banners: await listBanners() }) }
  catch (err) { res.status(500).json({ error: err.message }) }
}

export async function bannerCreate(req, res) {
  try {
    const banner = await createBanner(req.body)
    await logAdminAudit({ actor: req.userId, action: 'banner.create' })
    broadcastFeed({ type: 'admin:banner.created', banner, timestamp: Date.now() })
    res.json({ success: true, banner })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function feedSettingsGet(req, res) {
  try {
    const rows = await getFeedSettingsAll()
    const settings = {}
    for (const r of rows) settings[r.key] = r.value
    res.json({ success: true, settings })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function feedSettingsPut(req, res) {
  try {
    const { key, value } = req.body
    if (!key) return res.status(400).json({ error: 'key required' })
    await setFeedSettings(key, value || {})
    await logAdminAudit({ actor: req.userId, action: 'feed.settings', entity: 'feed_settings', meta: { key } })
    broadcastFeed({ type: 'admin:feed.settings.changed', key, value, timestamp: Date.now() })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function moderationReports(req, res) {
  try {
    const { pool } = await import('../db.js').then(m => m)
    const reports = await pool.query(`SELECT * FROM reports ORDER BY created_at DESC LIMIT 300`).then(r => r.rows)
    const forum = await getForumModerationItems()
    res.json({ success: true, reports, forum })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function moderationResolve(req, res) {
  try {
    const { id } = req.params
    const { status } = req.body
    await updateReportStatus(id, status || 'resolved')
    await logAdminAudit({ actor: req.userId, action: 'moderation.resolve', entity: 'report', entityId: id })
    broadcastFeed({ type: 'admin:report.resolved', reportId: id, status: status || 'resolved', timestamp: Date.now() })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function auditLogList(req, res) {
  try {
    const activity = await getRecentAdminActivity(200)
    res.json({ success: true, activity })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function communityList(req, res) {
  try {
    const { pool } = await import('../db.js').then(m => m)
    const [communities, forums, followers] = await Promise.all([
      pool.query('SELECT * FROM communities ORDER BY created_at DESC LIMIT 100').then(r => r.rows),
      pool.query('SELECT * FROM forum_topics ORDER BY created_at DESC LIMIT 100').then(r => r.rows),
      pool.query('SELECT COUNT(*) AS n FROM followers').then(r => Number(r.rows[0].n)),
    ])
    res.json({ success: true, communities, forums, followerCount: followers })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function creatorStudio(req, res) {
  try {
    const { getUsersByRole } = await import('../db.js')
    const creators = await getUsersByRole('creator')
    const safe = creators.map(u => ({ ...u, password: undefined }))
    res.json({ success: true, creators: safe })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

// Unified PPM config: single admin-set base_rate per creator (source of truth for payouts).
export async function getCreatorPPM(req, res) {
  try {
    const { creatorId } = req.params
    const { pool } = await import('../db.js')
    const { rows } = await pool.query(
      `SELECT creator_id, base_rate, movie_vpm, short_vpm, minimum_payout, auto_settle, updated_at
       FROM creator_ppm_config WHERE creator_id = $1`,
      [creatorId]
    )
    res.json({ success: true, config: rows[0] || { creator_id: creatorId, base_rate: 10.00 } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function setCreatorPPM(req, res) {
  try {
    const { creatorId } = req.params
    const { baseRate } = req.body
    if (baseRate === undefined || baseRate === null || isNaN(Number(baseRate))) {
      return res.status(400).json({ error: 'baseRate required (number)' })
    }
    const { pool } = await import('../db.js')
    const { rows } = await pool.query(
      `INSERT INTO creator_ppm_config (creator_id, base_rate, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (creator_id) DO UPDATE SET base_rate = $2, updated_at = NOW()
       RETURNING creator_id, base_rate, movie_vpm, short_vpm, minimum_payout, auto_settle, updated_at`,
      [creatorId, Number(baseRate)]
    )
    res.json({ success: true, config: rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

