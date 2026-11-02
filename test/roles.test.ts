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
