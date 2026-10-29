# flipword

Flashcards for learning vocabulary. Spaced repetition (FSRS), Google/Facebook sign-in, Anki and CSV import,
installable as a PWA. One Cloudflare Worker serves both the React app and the API.

See [SPEC.md](SPEC.md) for the product spec.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19, React Router, TanStack Query, Tailwind CSS 4, i18next |
| API | Hono on Cloudflare Workers (`/api/*`) |
| Database | Cloudflare D1 + Drizzle ORM |
| Photos | Cloudflare R2, resized to ≤1024px WebP in the browser before upload |
| Auth | Better Auth (Google, Facebook; email/password only for local dev) |
| Scheduling | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), shared by client (button previews) and server |
| Import | papaparse (CSV/TSV), fflate + fzstd + sql.js (Anki `.apkg`), all in the browser |
| Tests | Vitest in the Workers runtime (`@cloudflare/vitest-plugin`) |

## Local development

```sh
pnpm install
cp .dev.vars.example .dev.vars   # then set BETTER_AUTH_SECRET (e.g. `openssl rand -hex 32`)
pnpm db:migrate:local            # create the local D1 database
pnpm dev                         # http://localhost:5173
```

With `DEV_LOGIN=true` in `.dev.vars` the login page offers an email-only "dev login", so you don't need OAuth
credentials locally. Add Google/Facebook credentials to `.dev.vars` to test real sign-in.

| Command | |
|---|---|
| `pnpm dev` | Vite + Worker (workerd) with hot reload |
| `pnpm test` | API integration tests and logic unit tests |
| `pnpm lint` | oxlint |
| `pnpm build` | Type-check and build |
| `pnpm db:generate` | Generate a migration after editing `worker/db/schema.ts` |
| `pnpm db:migrate:local` / `db:migrate:remote` | Apply migrations |
| `pnpm cf-typegen` | Regenerate `worker-configuration.d.ts` after changing bindings or `.dev.vars` |
| `pnpm run deploy` | Build, apply remote migrations, deploy |

## Setting up sign-in

The callback URL is `<BETTER_AUTH_URL>/api/auth/callback/<provider>`.

**Google** — [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create credentials →
OAuth client ID → *Web application*.
- Authorized JavaScript origins: `http://localhost:5173`, `https://your-domain`
- Authorized redirect URIs: `http://localhost:5173/api/auth/callback/google`, `https://your-domain/api/auth/callback/google`

**Facebook** — [Meta for Developers](https://developers.facebook.com/apps) → Create app → add *Facebook Login*.
- Valid OAuth Redirect URIs: `https://your-domain/api/auth/callback/facebook`
- Request the `email` permission. Until the app passes Meta's review and business verification, only users with a
  role on the app (admins, developers, testers) can sign in.

A provider's button appears on the login page only when both its client ID and secret are set.

## Deploying to Cloudflare

```sh
npx wrangler login
npx wrangler d1 create flipword                 # copy the database_id into wrangler.jsonc
npx wrangler r2 bucket create flipword-images   # card photos
npx wrangler secret put BETTER_AUTH_SECRET      # random 32+ characters
npx wrangler secret put BETTER_AUTH_URL         # e.g. https://flipword.example.com
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put FACEBOOK_CLIENT_ID
npx wrangler secret put FACEBOOK_CLIENT_SECRET
pnpm run deploy
```

`DEV_LOGIN` is `"false"` in `wrangler.jsonc`, so email/password sign-in is disabled in production.
The Worker is served on the custom domain in `wrangler.jsonc` → `routes` (currently `flipword.chrpk.com`); use the
same URL as `BETTER_AUTH_URL`.

After that first setup, every push to `main` deploys automatically (`.github/workflows/deploy.yml`: lint, tests, then
`pnpm run deploy`). It needs a repository secret `CLOUDFLARE_API_TOKEN`, created in the Cloudflare dashboard under
*My Profile → API Tokens* from the *Edit Cloudflare Workers* template with *D1: Edit* added.

### Before going public

What the code already does: public `/privacy` and `/terms` pages (linked from the landing page, login and settings),
account deletion and a full data download in Settings, a Report button on public decks, a 200 MB photo allowance per
user (`PHOTO_STORAGE_BYTES` in `shared/images.ts`), rate limiting (Better Auth's limiter for sign-in, stored in D1; a
per-user limit on the API), security headers (`public/_headers` for the app, `secureHeaders()` for the API), link
previews with absolute `og:image`/`og:url` taken from the request (`worker/pages.ts`, so no domain to configure) and
a `/api/health` that checks D1 and R2. What needs you:

1. **Operator details.** Set `OPERATOR_NAME` and `CONTACT_EMAIL` in `wrangler.jsonc` → `vars`. They appear on the
   privacy policy and terms (GDPR needs the controller's identity and contact; the EU Digital Services Act needs a
   contact point). Read both pages (`src/i18n/locales/en.json` → `legal`) and adjust them to your situation — they're
   a starting point, not legal advice. Notably the minimum age is 16; bump `LEGAL_UPDATED` in `src/lib/legal.ts` when
   the text changes.
2. **Cloudflare resources.** Create the D1 database and R2 bucket and fill in `database_id` (see above). Prefer the
   Workers Paid plan for a public launch: higher request and CPU limits, and D1 point-in-time recovery covers 30 days
   instead of 7.
3. **Google.** Use a separate Google Cloud project for production. On the OAuth consent screen set the app name, home
   page (`https://your-domain/`), privacy policy (`/privacy`) and terms (`/terms`) URLs, verify the domain in Search
   Console, then *Publish app*. flipword only asks for basic profile scopes, so publishing doesn't need a security
   review — but showing the app name and logo on the consent screen goes through brand verification.
4. **Facebook.** In the Meta app's *Basic settings* set the privacy policy URL, terms URL, app icon and category, and
   use `https://your-domain/privacy#deletion` as the *User data deletion* instructions URL. Then complete business
   verification and App Review for `email`, and switch the app to Live.
5. **Monitoring.** Point an uptime check at `https://your-domain/api/health` (503 when D1 or R2 is unreachable).
   Workers Observability (on in `wrangler.jsonc`) keeps logs and errors; add a notification for error spikes in the
   Cloudflare dashboard.
6. **After the first deploy**, on the real domain: sign in with each provider, open `/privacy` and a shared deck while
   signed out, delete a test account and check its photos are gone from R2 (`wrangler r2 object list flipword-images`).

### Backups

D1 keeps point-in-time recovery for every database automatically (`wrangler d1 time-travel restore flipword
--timestamp=…`). For a copy outside Cloudflare, run `pnpm db:backup`, which writes a SQL dump to `backups/` (ignored by
git; it contains user data, so store it encrypted). Card photos in R2 aren't part of either.

### Moderation

Reports from the Report button land in the `content_report` table. There's no admin screen; use `wrangler d1 execute
flipword --remote --command "…"`:

```sql
-- Open reports, newest first
select r.created_at, r.reason, r.details, d.id as deck_id, d.name, d.visibility, u.email as author
from content_report r join deck d on d.id = r.deck_id join user u on u.id = d.user_id
where r.resolved_at is null order by r.created_at desc;

-- Take a deck out of Discover and its link (the owner can still see it)
update deck set visibility = 'private' where id = '<deck id>';

-- Mark the deck's reports handled
update content_report set resolved_at = cast(unixepoch('subsecond') * 1000 as integer) where deck_id = '<deck id>';
```

When you act on a report, email the author the reason (the DSA asks for a statement of reasons). To remove an
account entirely, delete its `user` row; decks, cards and history go with it, but its photos must be removed from R2
with `wrangler r2 object delete` under the `<user id>/` prefix.

## Project layout

```
shared/          Code used by both sides: FSRS wrapper, zod schemas, API types
worker/          Hono API
  db/schema.ts   Drizzle schema (Better Auth tables + decks, cards, review_log, user_settings)
  routes/        decks, public decks (search/view/copy), cards, study + reviews, stats, achievements, me/settings
src/             React app
  pages/         Login, Welcome, Decks, Deck, Discover, Shared deck, Study, Import, Stats, Achievements, Settings
  features/      study queue logic, CSV/Anki parsers
  i18n/          i18next setup and locale files
migrations/      SQL migrations (drizzle-kit output, applied by wrangler)
test/            Vitest suites (run inside workerd with a migrated D1)
```

## Adding an interface language

1. Copy `src/i18n/locales/en.json` to e.g. `de.json` and translate the values (keep `_one` / `_other` plural keys).
2. Import it in `src/i18n/index.ts`, add it to `resources` and to `UI_LOCALES`.

The language picker in Settings lists everything in `UI_LOCALES`; dates, numbers and language names are formatted with
`Intl` in the selected locale.

## How scheduling works

- New cards go through learning steps (1m, 10m), then FSRS schedules reviews to hit the target retention (default 90%).
- The client computes the interval shown on each answer button with the same scheduler and sends the reveal timestamp,
  so the server's result matches the preview (fuzz included).
- Daily limits (new cards, reviews) are counted from `review_log` using the client's timezone offset (`X-Tz-Offset`).
- Undo restores the card from its last review log entry (`ts-fsrs` rollback) and deletes that entry.
- A word is one or two card rows sharing a `note_id`: the forward card (its id is the note id) and, when the deck has
  "Also study in reverse", a reverse card. Text, deck and suspension apply to the whole word; scheduling is per card.
- Siblings are buried like in Anki: one direction per word per session, the other waits until the next day.
- A card that lapses for the 8th time (Anki's leech threshold) suspends its word, and again at 12, 16, … if unsuspended.

## Connecting AI assistants (MCP)

flipword exposes an MCP server at `/api/mcp` (Streamable HTTP, stateless, JSON responses).

1. In the app: **Settings → Connect an AI assistant → Create token**. The token is shown once; only its SHA-256 hash
   is stored. Tokens can be revoked there any time, and can't be used to manage tokens or the account.
2. Configure the client (the settings page shows these with your URL and token filled in):

```sh
# Claude Code
claude mcp add --transport http flipword https://your-domain/api/mcp --header "Authorization: Bearer fw_…"
```

```jsonc
// Cursor (~/.cursor/mcp.json)
{ "mcpServers": { "flipword": { "url": "https://your-domain/api/mcp", "headers": { "Authorization": "Bearer fw_…" } } } }

// Claude Desktop (claude_desktop_config.json), via mcp-remote
{ "mcpServers": { "flipword": { "command": "npx", "args": ["-y", "mcp-remote", "https://your-domain/api/mcp",
  "--header", "Authorization:${AUTH_HEADER}"], "env": { "AUTH_HEADER": "Bearer fw_…" } } } }
```

| Tool | What it does |
|---|---|
| `list_decks` | Decks with word, learned and due-today counts |
| `create_deck` / `update_deck` / `delete_deck` | Manage decks (name, description, reverse cards, public/private) |
| `search_public_decks` / `list_public_deck_cards` | Find other users' public decks and preview their words |
| `copy_public_deck` | Add a private copy of a public deck to the user's decks |
| `list_cards` | List/search a deck's words with status and right/wrong counts |
| `add_card` / `add_cards` | Add one word, or up to 2,000 at once (duplicates skipped by default) |
| `update_card` | Edit text, move deck, mark learned, suspend, set flag |
| `delete_card` | Delete a word (both directions, photo, history) |

Tools call the regular REST routes internally with the caller's credentials, so validation and ownership checks are
identical to the app. The same token also works as `Authorization: Bearer` for the REST API.

Not yet supported: OAuth sign-in (needed for claude.ai's remote "custom connectors"). Better Auth's
`@better-auth/oauth-provider` plugin is the intended route.

## Games and progress

- `practice_log` stores every game answer; `game_session` stores finished games for best scores.
- A word's right/wrong counts combine `review_log` (Again = wrong) and `practice_log` across both directions.
- Games live in `src/features/games/`: pure logic in `logic.ts` (unit-tested), one component per game, and
  `catalog.tsx` registering them. To add a game: add its id to `shared/games.ts`, write the component, register it in
  the catalog and add its strings under `games.<id>` in the locale file.

## Achievements

- Tracks and tier goals live in `shared/achievements.ts` (streak, words learned, reviews, games). Changing a goal list
  is enough to add or remove tiers; ids are `<track>-<goal>`.
- `GET /api/achievements` computes each track's value from existing tables and records newly reached tiers in the
  `achievement` table, so unlocks don't depend on which code path changed the numbers and are kept once earned.
- The app announces unlocked-but-unseen tiers with a toast (`AchievementWatcher`) and marks them seen with
  `POST /api/achievements/seen`. Its query key sits under `["stats"]`, so anything that refreshes stats re-checks.
- A new track needs: a goal list, its value in `worker/routes/achievements.ts`, an icon/colour in
  `src/features/achievements/meta.ts`, and `achievements.<track>.{title,description,name}` strings.
