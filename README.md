# payload-plugin-roles

Per-site role ladders for multi-tenant [Payload](https://payloadcms.com) sites.

Most sites need a handful of roles per site, where a higher role can do everything a lower one can.
Permission matrices are overkill for that. This plugin gives you:

- **A ladder** of per-site roles, lowest first, e.g. **Member · Author · Curator · Administrator**.
  `atLeast('author')` means Author, Curator or Administrator.
- **Platform roles** (e.g. **Maintainer**) for people who work across every site.
- **Add-on roles** outside the ladder (e.g. "Lab partner") that grant only what you check for them.
- **Per-site role names**: call Curator "Editor" on one site without changing permissions.
- **Access helpers** that return Payload `Where` constraints (`tenant in [...]`), built for
  [`@payloadcms/plugin-multi-tenant`](https://payloadcms.com/docs/plugins/multi-tenant)'s `tenants[].roles` layout.

A role on one site never grants anything on another.

## On its own, and with others

**On its own:** `defineRoles` gives you the helpers with no plugin installed at all. `rolesPlugin` only adds per-site role names to your tenants collection and keeps the role system on `config.custom.roles`. Field names default to the multi-tenant plugin's layout, and `fields` changes them.

**Works with:**
- **Payload's multi-tenant plugin** (`@payloadcms/plugin-multi-tenant`): its `tenants[].roles` layout is the default, and `roles.options()` fills its role select.

No other plugin reads `config.custom.roles` yet.

**Family:** It's part of the **Identity** family (a working draft): plugins designed to sit together for accounts and access.

## Install

```bash
npm install @extantape/payload-plugin-roles
```

```ts
import { defineRoles, rolesPlugin } from '@extantape/payload-plugin-roles'

export const roles = defineRoles({
  ladder: [
    { value: 'member', label: 'Member' },
    { value: 'author', label: 'Author' },
    { value: 'curator', label: 'Curator' },
    { value: 'admin', label: 'Administrator' },
  ],
  addOns: [{ value: 'lab', label: 'Lab partner' }],
  platform: [{ value: 'maintainer', label: 'Maintainer' }],
})

export default buildConfig({
  plugins: [
    multiTenantPlugin({
      tenantsArrayField: { rowFields: [{ name: 'roles', type: 'select', hasMany: true, options: roles.options() }] },
      userHasAccessToAllTenants: (user) => roles.isPlatform(user, 'maintainer'),
    }),
    rolesPlugin(roles), // adds "Role names on this site" to the tenants collection
  ],
})
```

## Helpers

| Helper | |
|---|---|
| `roles.atLeast('curator')` | `['curator', 'admin']` |
| `roles.sites(user, 'author')` | Site IDs where the user is Author or higher |
| `roles.has(user, site, 'curator', { platformRole: 'maintainer' })` | Curator or higher there (maintainers pass) |
| `roles.highest(user, site)` | The user's top ladder role on a site |
| `roles.isPlatform(user, 'maintainer')` | Platform role check |
| `roles.access.atLeast('curator', { platformRole: 'maintainer' })` | A Payload `Access`: `true` for maintainers, else `{ tenant: { in: [...] } }` |
| `roles.label(role, site.roleLabels)` / `roles.options(aliases)` | Names and select options, with per-site names |

Field names default to the multi-tenant plugin's (`tenants`, `tenant`, `roles`) and `platformRoles`;
change them with `fields`.

## License

MIT
