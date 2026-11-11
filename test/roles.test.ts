import type { Config } from 'payload'
import { describe, expect, it } from 'vitest'

import { defineRoles, rolesPlugin } from '../src/index.js'

const roles = defineRoles({
  ladder: [
    { value: 'member', label: 'Member' },
    { value: 'author', label: 'Author' },
    { value: 'curator', label: 'Curator' },
    { value: 'admin', label: 'Administrator' },
  ],
  addOns: [{ value: 'lab', label: 'Lab partner' }],
  platform: [{ value: 'maintainer', label: 'Maintainer' }],
})
const user = (tenants: { tenant: string | { id: string }; roles: string[] }[], platformRoles: string[] = []) => ({ id: 'u', tenants, platformRoles })

describe('ladder', () => {
  it('higher roles include lower ones; add-ons are only themselves', () => {
    expect(roles.atLeast('author')).toEqual(['author', 'curator', 'admin'])
    expect(roles.atLeast('lab')).toEqual(['lab'])
    expect(() => roles.atLeast('nope')).toThrow(/unknown role/)
    const u = user([{ tenant: 'a', roles: ['curator'] }, { tenant: { id: 'b' }, roles: ['member', 'lab'] }])
    expect(roles.sites(u, 'author')).toEqual(['a'])
    expect(roles.sites(u, 'member')).toEqual(['a', 'b'])
    expect(roles.sites(u, 'lab')).toEqual(['b'])
    expect(roles.has(u, 'a', 'author')).toBe(true)
    expect(roles.has(u, 'b', 'author')).toBe(false)
    expect(roles.highest(u, 'a')).toBe('curator')
    expect(roles.highest(u, 'c')).toBeNull()
  })

  it('a role on one site grants nothing on another; platform roles pass everywhere when asked', () => {
    const u = user([{ tenant: 'a', roles: ['admin'] }])
    expect(roles.has(u, 'b', 'member')).toBe(false)
    const m = user([], ['maintainer'])
    expect(roles.has(m, 'b', 'admin')).toBe(false)
    expect(roles.has(m, 'b', 'admin', { platformRole: 'maintainer' })).toBe(true)
  })

  it('builds access constraints', () => {
    const access = roles.access.atLeast('curator', { platformRole: 'maintainer' })
    const req = (u: unknown) => ({ req: { user: u } }) as never
    expect(access(req(user([{ tenant: 'a', roles: ['admin'] }, { tenant: 'b', roles: ['author'] }])))).toEqual({ tenant: { in: ['a'] } })
    expect(access(req(user([], ['maintainer'])))).toBe(true)
    expect(access(req(null))).toBe(false)
  })

  it('labels and options follow per-site aliases', () => {
    expect(roles.label('curator')).toBe('Curator')
    expect(roles.label('curator', [{ role: 'curator', label: 'Editor' }])).toBe('Editor')
    expect(roles.options().map((o) => o.value)).toEqual(['admin', 'curator', 'author', 'member', 'lab'])
    expect(roles.platformOptions()).toEqual([{ label: 'Maintainer', value: 'maintainer' }])
  })

  it('refuses duplicate values', () => {
    expect(() => defineRoles({ ladder: [{ value: 'a', label: 'A' }], addOns: [{ value: 'a', label: 'B' }] })).toThrow(/unique/)
  })
})

describe('plugin', () => {
  it('adds per-site role names to the tenants collection', () => {
    const config = rolesPlugin(roles)({ collections: [{ slug: 'tenants', fields: [{ name: 'name', type: 'text' }] }] } as unknown as Config)
    const tenants = config.collections!.find((c) => c.slug === 'tenants')!
    expect(tenants.fields.map((f) => ('name' in f ? f.name : null))).toContain('roleLabels')
    expect(config.custom?.roles).toBe(roles)
  })
})

describe('refusals (test audit 2026-11-10)', () => {
  const req = (u: unknown) => ({ req: { user: u } }) as never

  it('grants nothing without a site, for an unknown site, or for a row with no site', () => {
    const u = user([{ tenant: 'a', roles: ['admin'] }])
    expect(roles.has(u, null, 'member')).toBe(false)
    expect(roles.has(u, undefined, 'member')).toBe(false)
    expect(roles.has(u, '', 'member')).toBe(false)
    expect(roles.has(u, { id: 'z' }, 'member')).toBe(false)
    // A membership row whose site is missing never matches "no site".
    const broken = { id: 'u', tenants: [{ tenant: null, roles: ['admin'] }, { roles: ['admin'] }] }
    expect(roles.sites(broken, 'member')).toEqual([])
    expect(roles.has(broken, null, 'member')).toBe(false)
    // highest() with no site gives no role, even when a row has no site either (fixed 2026-11-10).
    for (const none of [null, undefined, '']) expect(roles.highest(broken, none)).toBeNull()
    expect(roles.highest(broken, 'a')).toBeNull()
    // A site-less row stays ignored next to a real one.
    const mixed = { id: 'u', tenants: [{ tenant: null, roles: ['admin'] }, { tenant: 'a', roles: ['author'] }] }
    expect(roles.highest(mixed, null)).toBeNull()
    expect(roles.highest(mixed, 'a')).toBe('author')
  })

  it('a lower role, an add-on or an unknown stored role never passes a ladder check', () => {
    const u = user([
      { tenant: 'a', roles: ['author'] },
      { tenant: 'b', roles: ['lab'] },
      { tenant: 'c', roles: ['superadmin', 'owner'] },
    ])
    expect(roles.has(u, 'a', 'curator')).toBe(false)
    expect(roles.has(u, 'b', 'member')).toBe(false)
    expect(roles.has(u, 'c', 'member')).toBe(false)
    expect(roles.highest(u, 'b')).toBeNull()
    expect(roles.highest(u, 'c')).toBeNull()
    expect(roles.sites(u, 'member')).toEqual(['a'])
    // An add-on check passes only for that add-on, never for ladder roles.
    expect(roles.has(user([{ tenant: 'a', roles: ['admin'] }]), 'a', 'lab')).toBe(false)
    // A list of roles is matched exactly, without climbing the ladder.
    expect(roles.sites(user([{ tenant: 'a', roles: ['admin'] }]), ['author'])).toEqual([])
  })

  it('a platform role passes only when asked for, and only that role', () => {
    const other = user([], ['support'])
    expect(roles.isPlatform(other, 'maintainer')).toBe(false)
    expect(roles.isPlatform(other)).toBe(true)
    expect(roles.isPlatform(user([]))).toBe(false)
    expect(roles.has(other, 'a', 'member', { platformRole: 'maintainer' })).toBe(false)
  })

  it('reads malformed users as having no roles', () => {
    for (const bad of [null, undefined, 'u', 42, {}, { tenants: 'a', platformRoles: 'maintainer' }, { tenants: [{ tenant: 'a' }] }]) {
      expect(roles.sites(bad, 'member')).toEqual([])
      expect(roles.has(bad, 'a', 'member', { platformRole: 'maintainer' })).toBe(false)
      expect(roles.isPlatform(bad)).toBe(false)
      expect(roles.highest(bad, 'a')).toBeNull()
    }
  })

  it('a roles value stored as a string, or a null row, grants nothing and does not throw (fixed 2026-11-10)', () => {
    const odd = { id: 'u', tenants: [{ tenant: 'a', roles: 'admin' }, null, { tenant: 'b', roles: [42, null, 'author'] }], platformRoles: [] }
    expect(() => roles.sites(odd, 'member')).not.toThrow()
    expect(roles.sites(odd, 'member')).toEqual(['b'])
    expect(roles.has(odd, 'a', 'member')).toBe(false)
    expect(roles.highest(odd, 'a')).toBeNull()
    expect(roles.highest(odd, 'b')).toBe('author')
    const access = roles.access.atLeast('member', { platformRole: 'maintainer' })
    const onlyString = { id: 'u', tenants: [{ tenant: 'a', roles: 'admin' }], platformRoles: [] }
    expect(access(req(onlyString))).toBe(false)
  })

  it('access refuses users with no qualifying role, other platform roles, and maintainers when no platform role is named', () => {
    const access = roles.access.atLeast('curator', { platformRole: 'maintainer' })
    expect(access(req(undefined))).toBe(false)
    expect(access(req(user([{ tenant: 'a', roles: ['author'] }, { tenant: 'b', roles: ['lab'] }])))).toBe(false)
    expect(access(req(user([], ['support'])))).toBe(false)
    expect(access(req(user([{ tenant: 'a', roles: ['admin'] }], ['support'])))).toEqual({ tenant: { in: ['a'] } })
    const noBypass = roles.access.atLeast('curator')
    expect(noBypass(req(user([], ['maintainer'])))).toBe(false)
    expect(noBypass(req(user([{ tenant: 'a', roles: ['admin'] }], ['maintainer'])))).toEqual({ tenant: { in: ['a'] } })
  })

  it('access constrains the field it is told to, and reads custom user fields', () => {
    const custom = defineRoles({ ladder: [{ value: 'viewer', label: 'Viewer' }, { value: 'editor', label: 'Editor' }], fields: { tenants: 'sites', tenant: 'site', roles: 'levels', platform: 'staff' } })
    const u = { sites: [{ site: { id: 7 }, levels: ['editor'] }, { site: 8, levels: ['viewer'] }], staff: [] }
    expect(custom.sites(u, 'editor')).toEqual(['7'])
    expect(custom.has(u, 7, 'editor')).toBe(true)
    expect(custom.has(u, 8, 'editor')).toBe(false)
    // The default field names don't count once custom ones are set.
    expect(custom.sites({ tenants: [{ tenant: 'a', roles: ['editor'] }] }, 'viewer')).toEqual([])
    expect(custom.access.atLeast('viewer', { field: 'owner' })(req(u))).toEqual({ owner: { in: ['7', '8'] } })
  })

  it('refuses an empty ladder', () => {
    expect(() => defineRoles({ ladder: [] })).toThrow(/at least one role/)
  })
})

describe('plugin options (test audit 2026-11-10)', () => {
  const base = () => ({ collections: [{ slug: 'tenants', fields: [] }, { slug: 'sites', fields: [] }, { slug: 'posts', fields: [] }] }) as unknown as Config
  const names = (config: Config, slug: string) => config.collections!.find((c) => c.slug === slug)!.fields.map((f) => ('name' in f ? f.name : null))

  it('puts role names behind canRename, on the collection it is told to, and nowhere else', () => {
    const canRename = () => false
    const config = rolesPlugin(roles, { tenants: 'sites', canRename })(base())
    expect(names(config, 'tenants')).toEqual([])
    expect(names(config, 'posts')).toEqual([])
    const field = config.collections!.find((c) => c.slug === 'sites')!.fields[0] as { name: string; access?: { create?: unknown; update?: unknown } }
    expect(field.name).toBe('roleLabels')
    expect(field.access).toEqual({ create: canRename, update: canRename })
  })

  it('adds nothing with tenants: false, and offers only per-site roles to rename', () => {
    const off = rolesPlugin(roles, { tenants: false })(base())
    for (const slug of ['tenants', 'sites', 'posts']) expect(names(off, slug)).toEqual([])
    const on = rolesPlugin(roles)(base())
    const row = (on.collections!.find((c) => c.slug === 'tenants')!.fields[0] as { fields: { fields: { name: string; options?: { value: string }[] }[] }[] }).fields[0]!.fields
    expect(row.find((f) => f.name === 'role')!.options!.map((o) => o.value)).toEqual(['member', 'author', 'curator', 'admin', 'lab'])
  })
})
