import type { Config, Field, FieldAccess, Plugin } from 'payload'

import type { RoleSystem } from './roles.js'

export type RolesPluginOptions = {
  /** The tenants (sites) collection that gets per-site role names. Default `tenants`. Set false to skip. */
  tenants?: string | false
  /** Who may rename roles on a site (field access). Default: anyone who may update the site. */
  canRename?: FieldAccess
}

/**
 * Adds per-site role names ("aliases", e.g. call Curator "Editor" on one site)
 * to the tenants collection and keeps the role system on `config.custom.roles`.
 * The helpers themselves come from `defineRoles()` and work without the plugin.
 */
export const rolesPlugin =
  (system: RoleSystem, options: RolesPluginOptions = {}): ((config: Config) => Config) & Plugin =>
  (config: Config): Config => {
    const tenants = options.tenants === false ? null : (options.tenants ?? 'tenants')
    const aliases: Field = {
      name: 'roleLabels',
      label: 'Role names on this site',
      type: 'array',
      admin: { description: 'Optional: show a role under another name here (e.g. Curator as “Editor”). Permissions don’t change.', initCollapsed: true },
      access: options.canRename ? { create: options.canRename, update: options.canRename } : undefined,
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'role', type: 'select', required: true, options: [...system.ladder, ...system.addOns].map((r) => ({ label: r.label, value: r.value })), admin: { width: '50%' } },
            { name: 'label', type: 'text', required: true, admin: { width: '50%' } },
          ],
        },
      ],
    }
    const next: Config = {
      ...config,
      collections: (config.collections ?? []).map((c) => (tenants && c.slug === tenants ? { ...c, fields: [...c.fields, aliases] } : c)),
      custom: { ...config.custom, roles: system },
    }
    return next
  }
