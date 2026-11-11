import type { Access, PayloadRequest, Where } from 'payload'

/** One role: the stored value and its default label. */
export type RoleDef = { value: string; label: string; description?: string }

export type RolesConfig = {
  /** Per-site roles, lowest first. Each includes every role below it (Curator can do what Author can). */
  ladder: RoleDef[]
  /** Per-site roles outside the ladder (e.g. "Lab partner"): they grant only what you check for them. */
  addOns?: RoleDef[]
  /** Platform-wide roles (e.g. "Maintainer"), for every site. */
  platform?: RoleDef[]
  /** Where roles live on the user. Defaults match @payloadcms/plugin-multi-tenant. */
  fields?: { tenants?: string; tenant?: string; roles?: string; platform?: string }
}

/** Any user object (e.g. Payload's generated `User`); read defensively. */
type AnyUser = unknown
const idOf = (v: unknown): string | null => (v && typeof v === 'object' ? (v as { id?: unknown }).id != null ? String((v as { id: unknown }).id) : null : v != null && v !== '' ? String(v) : null)

/** Per-site display names, e.g. `[{ role: 'curator', label: 'Editor' }]` (stored on the site by the plugin). */
export type RoleAliases = { role: string; label: string }[] | null | undefined

export type RoleSystem = ReturnType<typeof defineRoles>

/**
 * A role system: a ranked ladder of per-site roles, add-on roles and platform
 * roles, with helpers that answer "may this user do X on this site?" and
 * Payload access functions built from them.
 */
export function defineRoles(config: RolesConfig) {
  const ladder = config.ladder
  const addOns = config.addOns ?? []
  const platform = config.platform ?? []
  if (!ladder.length) throw new Error('payload-plugin-roles: the ladder needs at least one role')
  const values = [...ladder, ...addOns].map((r) => r.value)
  if (new Set(values).size !== values.length) throw new Error('payload-plugin-roles: role values must be unique')
  const f = { tenants: 'tenants', tenant: 'tenant', roles: 'roles', platform: 'platformRoles', ...config.fields }
  const rank = (role: string) => ladder.findIndex((r) => r.value === role)

  /** Ladder roles at or above `role`; an add-on role is only itself. */
  const atLeast = (role: string): string[] => {
    const i = rank(role)
    if (i >= 0) return ladder.slice(i).map((r) => r.value)
    if (addOns.some((r) => r.value === role)) return [role]
    throw new Error(`payload-plugin-roles: unknown role "${role}"`)
  }

  const field = (user: AnyUser, name: string): unknown => (user && typeof user === 'object' ? (user as Record<string, unknown>)[name] : undefined)
  const rows = (user: AnyUser) => { const v = field(user, f.tenants); return Array.isArray(v) ? (v as Record<string, unknown>[]) : [] }
  const platformRoles = (user: AnyUser) => { const v = field(user, f.platform); return Array.isArray(v) ? (v as string[]) : [] }
  /** A row's roles. Anything but an array (e.g. a string) reads as no roles: unclear data grants nothing. */
  const rowRoles = (row: Record<string, unknown> | undefined): string[] => {
    const v = row && typeof row === 'object' ? row[f.roles] : undefined
    return Array.isArray(v) ? v.filter((r): r is string => typeof r === 'string') : []
  }

  /** Has this platform role (any platform role when omitted). */
  const isPlatform = (user: AnyUser, role?: string) => (role ? platformRoles(user).includes(role) : platformRoles(user).length > 0)

  /** Sites where the user holds `role` or higher (or exactly one of a list of roles). */
  const sites = (user: AnyUser, role: string | readonly string[]): string[] => {
    const wanted = typeof role === 'string' ? atLeast(role) : role
    return rows(user)
      .filter((row) => rowRoles(row).some((r) => wanted.includes(r)))
      .map((row) => idOf(row[f.tenant]))
      .filter((id): id is string => Boolean(id))
  }

  /** Whether the user holds `role` or higher on this site. `platformRole` holders pass everywhere. */
  const has = (user: AnyUser, site: unknown, role: string, { platformRole }: { platformRole?: string } = {}) =>
    (platformRole ? isPlatform(user, platformRole) : false) || (Boolean(idOf(site)) && sites(user, role).includes(idOf(site)!))

  /** The user's highest ladder role on a site (null if none). No site, or a row without one, never matches. */
  const highest = (user: AnyUser, site: unknown): string | null => {
    const id = idOf(site)
    if (!id) return null
    const row = rows(user).find((r) => r && typeof r === 'object' && idOf(r[f.tenant]) === id)
    const held = rowRoles(row).map(rank).filter((i) => i >= 0)
    return held.length ? ladder[Math.max(...held)]!.value : null
  }

  const label = (role: string, aliases?: RoleAliases) =>
    aliases?.find((a) => a.role === role)?.label || [...ladder, ...addOns, ...platform].find((r) => r.value === role)?.label || role

  /** Select options for per-site roles (ladder highest first, then add-ons), with optional aliases. */
  const options = (aliases?: RoleAliases) => [...[...ladder].reverse(), ...addOns].map((r) => ({ label: label(r.value, aliases), value: r.value }))
  const platformOptions = () => platform.map((r) => ({ label: r.label, value: r.value }))

  /**
   * Access: platform role holders see everything; others only records of sites
   * where they hold `role` or higher (a `tenant in [...]` constraint).
   */
  const accessAtLeast =
    (role: string, { platformRole, field = f.tenant }: { platformRole?: string; field?: string } = {}): Access =>
    ({ req }: { req: PayloadRequest }) => {
      if (platformRole && isPlatform(req.user as AnyUser, platformRole)) return true
      const ids = sites(req.user as AnyUser, role)
      return ids.length ? ({ [field]: { in: ids } } as Where) : false
    }

  return {
    ladder,
    addOns,
    platform,
    fields: f,
    /** Every per-site role value (ladder and add-ons). */
    values,
    rank,
    atLeast,
    isPlatform,
    sites,
    has,
    highest,
    label,
    options,
    platformOptions,
    access: { atLeast: accessAtLeast },
  }
}
