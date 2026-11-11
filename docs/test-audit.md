# Test audit

Kept by this repo's owning session, per `~/Code/CLAUDE.md` "Test self-audits". Newest first.

## 2026-11-10: first audit

Suite before: 6 tests. After: 15 tests (`npx vitest run`, all in `test/roles.test.ts`). No `docs/decisions.md` yet, so the promises come from the README and the code comments.

### Promises and the tests that prove them

| Promise | Test |
| --- | --- |
| The ladder: a higher role includes every lower one; `atLeast` lists them; unknown roles throw | ladder › higher roles include lower ones |
| Add-on roles grant only themselves, never a ladder check, and ladder roles never pass an add-on check | ladder › higher roles include lower ones; refusals › a lower role, an add-on or an unknown stored role |
| A role on one site never grants anything on another | ladder › a role on one site grants nothing on another; refusals › grants nothing without a site |
| A role value stored on a user but not defined (e.g. `superadmin`) grants nothing | refusals › a lower role, an add-on or an unknown stored role |
| A list of roles passed to `sites()` is matched exactly, without climbing the ladder | refusals › a lower role, an add-on or an unknown stored role |
| Platform roles pass everywhere only when the check names that platform role; another platform role doesn't | ladder › … platform roles pass everywhere when asked; refusals › a platform role passes only when asked for |
| Missing, empty or unknown sites, and membership rows without a site, grant nothing | refusals › grants nothing without a site |
| Malformed or missing users (null, strings, non-array fields) hold no roles | refusals › reads malformed users as having no roles |
| `access.atLeast`: `true` only for the named platform role, a `tenant in [...]` constraint for qualifying sites, `false` otherwise (anonymous, too low, other platform roles, no platform role named) | ladder › builds access constraints; refusals › access refuses users with no qualifying role… |
| Custom field names (`fields`) and a custom access `field` are honored, and the defaults stop counting | refusals › access constrains the field it is told to |
| Role values must be unique; the ladder must not be empty | ladder › refuses duplicate values; refusals › refuses an empty ladder |
| Per-site names change labels and options, never permissions | ladder › labels and options follow per-site aliases (labels never feed `has`/`sites`, so nothing more to prove) |
| The plugin adds "Role names on this site" to the tenants collection and keeps the system on `config.custom.roles` | plugin › adds per-site role names |
| `canRename` guards the role-names field; `tenants` picks the collection; `tenants: false` adds nothing; other collections are untouched; only per-site roles can be renamed | plugin options › both tests |

### Gaps added (with their tests)

- Refusals for missing or unknown sites and site-less rows: "grants nothing without a site…".
- Lower roles, add-ons and undefined stored roles never passing ladder checks: "a lower role, an add-on or an unknown stored role…".
- Platform roles: only the named one, and only when asked for: "a platform role passes only when asked for…".
- Malformed user data: "reads malformed users as having no roles".
- Access refusals (anonymous, too low, wrong platform role, maintainer without a named platform role): "access refuses users…".
- Custom field names and the access `field` option: "access constrains the field it is told to…".
- Empty ladder: "refuses an empty ladder".
- Plugin options `canRename`, `tenants`, `tenants: false`: "plugin options" (two tests).

### Bug found, not fixed (no feature code changed)

- `src/roles.ts` line 71, `highest()`: a membership row with no site (`tenant` null or missing) matches a missing site, because `idOf(null) === idOf(null)`. `highest(user, null)` returns that row's top role (`'admin'` in the test) instead of `null`. `has()` and `sites()` are not affected (they ignore site-less rows and require a site). The assertion is left out of the suite and noted in the test "grants nothing without a site…".

### Gaps skipped (with why)

- `label()` and `options()` fallbacks beyond what's tested: display only, no access decision, and the existing test covers aliases and order.
- `rank`, `values`, `platformOptions`: trivial getters.
- Payload's own enforcement of field `access` on `roleLabels`: framework internals. The test proves the plugin passes `canRename` through.

### For the lead

- Fix `highest()` for site-less rows (above), then add `expect(roles.highest(broken, null)).toBeNull()` back.
- A membership row whose `roles` is a string instead of an array makes `sites()`, `has()`, `highest()` and the access function throw a `TypeError`. That fails closed (the request errors, nothing is granted), but decide whether it should read as "no roles" instead, and test whichever is chosen.
- An end-to-end test with `@payloadcms/plugin-multi-tenant` on a real Payload, proving the `Where` constraint really hides other sites' documents. Bigger: needs a database in the suite.
