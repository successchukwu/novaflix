// Central catalog of admin permission keys and the nav/dashboard surfaces they gate.
export const PERMISSIONS = [
  { key: 'dashboard.view', label: 'View Dashboard', group: 'Overview' },
  { key: 'analytics.view', label: 'View Analytics & Revenue', group: 'Overview' },
  { key: 'content.view', label: 'View Content Catalog', group: 'Content' },
  { key: 'content.edit', label: 'Edit Content & Metadata', group: 'Content' },
  { key: 'users.view', label: 'View Users', group: 'People' },
  { key: 'users.edit', label: 'Edit Users', group: 'People' },
  { key: 'users.ban', label: 'Suspend / Ban Users', group: 'People' },
  { key: 'users.roles', label: 'Assign Admin Roles', group: 'People' },
  { key: 'creators.view', label: 'View Creator Studio', group: 'People' },
  { key: 'creators.approve', label: 'Approve / Verify Creators', group: 'People' },
  { key: 'community.view', label: 'View Community', group: 'People' },
  { key: 'community.moderate', label: 'Moderate Community', group: 'Safety' },
  { key: 'moderation.view', label: 'View Moderation Queue', group: 'Safety' },
  { key: 'moderation.resolve', label: 'Resolve Reports', group: 'Safety' },
  { key: 'finance.view', label: 'View Transactions & Revenue', group: 'Business' },
  { key: 'finance.settle', label: 'Settle Creator Payouts', group: 'Business' },
  { key: 'marketing.announce', label: 'Send Announcements', group: 'Marketing' },
  { key: 'marketing.promo', label: 'Manage Promo & Banners', group: 'Marketing' },
  { key: 'promotions.manage', label: 'Manage Discounts & Promotions', group: 'Marketing' },
  { key: 'feed.edit', label: 'Edit Feed Settings', group: 'System' },
  { key: 'settings.view', label: 'View Settings', group: 'System' },
  { key: 'settings.edit', label: 'Edit Settings', group: 'System' },
  { key: 'logs.view', label: 'View Logs', group: 'System' },
  { key: 'logs.export', label: 'Export / Backup Logs', group: 'System' },
]

export const ALL_PERMISSIONS = PERMISSIONS.map((p) => p.key)

export const SUPER_ADMIN_SLUG = 'super-admin'

// Default permission set per predefined role.
export const DEFAULT_ROLES = [
  {
    name: 'Super Admin',
    slug: SUPER_ADMIN_SLUG,
    description: 'Full access to every dashboard, setting, log and user action.',
    permissions: ALL_PERMISSIONS,
  },
  {
    name: 'Content Manager',
    slug: 'content-manager',
    description: 'Manages the catalog, content metadata and creators.',
    permissions: ['dashboard.view', 'analytics.view', 'content.view', 'content.edit', 'creators.view', 'creators.approve', 'moderation.view'],
  },
  {
    name: 'Community Moderator',
    slug: 'community-moderator',
    description: 'Reviews reports and moderates community content.',
    permissions: ['dashboard.view', 'users.view', 'community.view', 'community.moderate', 'moderation.view', 'moderation.resolve'],
  },
  {
    name: 'Finance',
    slug: 'finance',
    description: 'Views transactions, revenue analytics and settles payouts.',
    permissions: ['dashboard.view', 'analytics.view', 'finance.view', 'finance.settle', 'users.view'],
  },
  {
    name: 'Marketing',
    slug: 'marketing',
    description: 'Sends announcements and manages promo codes and banners.',
    permissions: ['dashboard.view', 'analytics.view', 'marketing.announce', 'marketing.promo', 'promotions.manage'],
  },
  {
    name: 'Support',
    slug: 'support',
    description: 'Assists users, views users and helps resolve reports.',
    permissions: ['dashboard.view', 'users.view', 'users.edit', 'community.view', 'moderation.view', 'moderation.resolve', 'settings.view'],
  },
]
