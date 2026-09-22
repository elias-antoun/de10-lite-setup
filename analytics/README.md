# Private visit logs

The guide stays on GitHub Pages. `client.js` sends a page-load event to
`worker.mjs`, which stores a record in Cloudflare D1. View records while signed
in to Cloudflare; the Worker has no public read or list endpoint.

**Collection is disabled until `data-endpoint` in `index.html` is configured.**
The existing Cloudflare Web Analytics beacon is separate from these logs.

## Set up with the CLI

Use a Cloudflare account on **Workers Free**. No domain purchase is needed.
Run these commands from the repository root with Node.js 22.22.3 or newer:

```sh
cd analytics
npm ci
npx wrangler login
npx wrangler whoami
npx wrangler d1 create de10-lite-visits
```

The login opens Cloudflare's authorization page. Confirm `whoami` shows the
account you intend to use. If you have multiple accounts, set `account_id` in
`wrangler.jsonc` to that account's ID (an identifier, not a secret).

Copy the database UUID returned by `d1 create` into the existing
`database_id` field in `wrangler.jsonc`, replacing the all-zero placeholder.
Keep the binding name **DB** and database name **de10-lite-visits**. If Wrangler
offers to add a binding automatically, decline because one is already present.
Then initialize and deploy:

```sh
npx wrangler d1 execute de10-lite-visits --remote --file=schema.sql
npm run check
npm run deploy
```

The schema creates the table/index without deleting existing records. Never
upload a local test database or visitor exports into git. Cloudflare's CLI
stores authentication separately; do not put API tokens into HTML or config.

## Set up through the Cloudflare dashboard instead

1. Sign in at [Cloudflare](https://dash.cloudflare.com/). Under **Storage &
   databases → D1 SQL database**, create `de10-lite-visits`.
2. Open that database's **Console** and execute the statements from
   [`schema.sql`](schema.sql) to create the table and index.
3. Under **Workers & Pages**, create a Worker named `de10-lite-visits` using
   **Start with Hello World**. In **Edit code**, replace the starter code with
   [`worker.mjs`](worker.mjs) and deploy it.
4. Under that Worker's **Bindings**, add a **D1 database** binding. Use variable
   name **DB** and select `de10-lite-visits`.
5. Under **Settings → Variables and Secrets**, add these plain-text variables:

   | Name | Value |
   |---|---|
   | `ALLOWED_ORIGIN` | `https://elias-antoun.github.io` |
   | `SITE_PATH` | `/de10-lite-setup/` |
   | `RETENTION_DAYS` | `30` |

6. Under **Settings → Trigger Events**, add cron `0 3 * * *` (03:00 UTC daily).
   Ensure the Worker's `workers.dev` URL is enabled, and save/deploy changes.

Dashboard labels can change. Cloudflare's [D1 setup guide](https://developers.cloudflare.com/d1/get-started/)
explains both workflows. To manage the same Worker later with Wrangler, copy
its database UUID into `wrangler.jsonc` first; that file becomes the deployment
configuration, including variables and the cron.

## Activate and verify

Find the script near the end of the guide's `index.html` and set its
`data-endpoint` to the deployed Worker's URL followed by `/visit`:

```html
<script defer src="analytics/client.js"
  data-endpoint="https://de10-lite-visits.YOUR-SUBDOMAIN.workers.dev/visit"></script>
```

Use the actual URL Cloudflare returns. The endpoint is public; it is safe in
HTML and grants no read access. Keep the existing script element's other
attributes, if present. The visitor notice becomes visible when a valid
endpoint is configured. Publish the HTML and `analytics/client.js` through
your usual GitHub Pages workflow, then open the guide once.

In browser developer tools, under **Network**, expect a `POST /visit` returning
**204** (a successful preflight may precede it). Open **D1 → de10-lite-visits →
Console** in your signed-in Cloudflare account and run:

```sql
SELECT visited_at, ip, country, browser, os, device_type, path,
       language, viewport_width, viewport_height, referrer
FROM visits
ORDER BY visited_at DESC
LIMIT 100;
```

Confirm the new timestamp and your expected public connection IP. A request
to the Worker's root or a `GET /visit` should return **404**, not records. A
successful deployment alone does not verify collection: check a real page
load and its stored row. Visits from localhost/preview origins are rejected.

## Retention and private exports

The daily cron deletes live rows older than 30 days. Deletion occurs on the
next successful cleanup run, so a record may remain for up to roughly one
extra day. Cloudflare backups have separate retention. If you change
`RETENTION_DAYS`, also update the visitor notice in `index.html`.

The database console is restricted to people with access to your Cloudflare
account. There is no custom dashboard or shared dashboard password.

To export with the CLI, start from the repository root and use a directory
excluded from git:

```sh
cd analytics
mkdir -p exports
npx wrangler d1 export de10-lite-visits --remote --output=exports/visits.sql
```

Treat the export as private: it contains IP addresses. Export files are not
automatically removed by the Worker's cleanup schedule. To erase all live
visit records, run this deliberately in the D1 console:

```sql
DELETE FROM visits;
```

To stop collecting, blank `data-endpoint` and republish the page. For an
immediate stop that also covers cached pages, disable or delete the Worker
in Cloudflare. Removing the Worker does not itself delete the D1 database.

## Local development and tests

```sh
cd analytics
npm ci
npm test
npm run check
npx wrangler d1 execute de10-lite-visits --local --file=schema.sql
npm run dev
```

Tests exercise the actual handlers with an isolated local D1 database and
run the actual browser script in a controlled browser-like context. They do
not need a Cloudflare account or contact the production database. Miniflare
uses local sockets, so a restricted sandbox may require permission to run it.
`npm run check` bundles the Worker without deploying it. Local Wrangler data
is in `.wrangler/` and is ignored by git.

## What is recorded

Each accepted page load stores a server ID/time, public connection IP,
country when available, pathname, user-agent, inferred browser/OS/device
category, optional language/viewport dimensions, and referrer hostname.
Query strings, fragments, referrer paths, form values, and local project
paths are not recorded. No cookies or persistent visitor IDs are created.

Device detection is approximate. Shared Wi-Fi can share one IP, and a VPN
can replace it. Referrers may be missing. Reloads count again. Ad blockers,
disabled JavaScript, network problems, and quotas can produce missing visits.
Request validation limits fields and sizes; it does not make a visit proof
of a real person. Non-browser clients can forge an Origin header.

The page discloses collection. Assess any additional consent requirements
for your visitors before activation; the notice is not a blanket compliance
guarantee.

## Free limits and troubleshooting

As checked on 2026-09-22, Workers Free includes 100,000 requests/day; D1 Free
includes 100,000 rows written/day, 5 million rows read/day, and 5 GB total
account storage. A Free D1 database also has a per-database size limit; see
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/). Index
updates and cleanup deletions count as writes too. This configuration does
not subscribe to a paid plan or raise these limits.

If daily quotas are exhausted, collection can fail until they reset. Full
storage needs cleanup. The guide continues working when analytics fails.
See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

- **No request:** confirm `data-endpoint` is populated in the published HTML,
  JavaScript is enabled, and the script/request isn't blocked.
- **403:** the page origin must exactly match `ALLOWED_ORIGIN` (no trailing
  slash). A custom site domain requires updating this variable.
- **400/413/415:** check the payload types, pathname, size, and JSON content
  type. The collector requires Cloudflare's connecting-IP header.
- **503:** check the DB binding, applied schema, and available D1 quota. The
  public error response intentionally does not expose database details.
- **Cleanup failure:** check the Worker's scheduled invocation errors, its
  DB binding, and quota. Do not add logs that print visitor data.
