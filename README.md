# Keyport

[한국어](README.ko.md)

A self-hosted Tailscale auth key desk on Cloudflare. Select an account and tailnet on your phone, then issue and copy a single-use key valid for 24 hours.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ajchemist/keyport)

## Install in your browser

Click **Deploy to Cloudflare**, connect your own GitHub and Cloudflare accounts, and review the new repository, Worker, and D1 names. Before clicking **Deploy**, use these settings:

| Deployment setting | Value |
| --- | --- |
| Build command | `bun run build` |
| Deploy command | `bun run deploy` |
| Preview command | `bunx wrangler preview` |
| Protect with Cloudflare Access | **On** |
| Access traffic | **All traffic** |
| Access policy | Only trusted administrators. Choose **Cloudflare account** only if every account member is trusted. |
| Advanced settings → API token | **Create new token** |
| New API token name | **`keyport`** |
| Build variable, if pinning Bun | `BUN_VERSION=1.4.2` |
| Preview builds for the first installation | **Off**, until separate test resources and authentication are configured. |

Cloudflare controls these dashboard fields. Repository scripts do not overwrite saved selections or force Access protection, token creation, or the token name. Review the table even if the screen preselects different values. Never use Everyone or Bypass for Access.

**The `keyport` API token is for Cloudflare Builds, not Tailscale.** Let Cloudflare create and manage it for deployment; do not paste it into Git, the app, D1, or a Worker Secret. The deploy script applies D1 migrations, so confirm that the build token permits **Account → D1 → Edit** on the target account. Cloudflare's documented generic token permissions do not list D1: do not assume a newly generated token includes it. If a migration reports an authorization error, edit the generated `keyport` token under **My Profile → API Tokens**, add D1 edit permission on the target account, and retry the build. Do not substitute a Global API Key. [Build token documentation](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

Once deployment succeeds:

The wizard shows three steps: **Access settings → Recovery key → Save Secrets**. Expand the help sections when you need to repair Access policies or build settings.

The wizard prefills team domain, a single AUD, and your email from the Access login request when available. Review these unverified suggestions before continuing; without them, enter the values manually. Nothing is saved until you configure the Worker Secrets.

1. Open the Worker URL and sign in through Access to launch the **setup wizard**. No local CLI is needed.
2. Confirm Worker-wide Access protection and restrict the existing Access application to the actual administrator emails. Reuse its AUD tag instead of creating a duplicate application.
3. Generate an encryption key in your browser, then copy it or download a recovery file. Store it in an encrypted vault; the clipboard alone is not a backup.
4. Save the five values prepared by the wizard as **Secrets** under Worker **Settings → Variables and Secrets**, then deploy those settings. The app link only navigates; it does not save Secrets.
5. Open the app, add an account profile, and register a tailnet with its **Tailscale personal API token**. Tailscale tokens are encrypted in D1 and never shown again.

D1 is provisioned and bound automatically; no database ID copying is required. The button automates repository cloning, Workers Builds integration, resource provisioning, and deployment. Access policies, dashboard selections, token permissions when needed, and application Secrets remain explicit setup steps. End-to-end installation in a fresh Cloudflare account is not yet verified. [Official deployment guide](https://developers.cloudflare.com/workers/platform/deploy-buttons/)

Worker Previews use `bunx wrangler preview` (`bun run preview` is an alias in the current source), not `wrangler versions upload`. They do not inherit production settings. The empty `previews` block provides setup instructions only: configure separate test D1 bindings, Secrets, and Access before enabling management in a Preview. [Preview configuration](https://developers.cloudflare.com/workers/previews/configuration/)

If an earlier attempt already created a cloned repository, synchronize the latest source before restarting. Upstream updates do not automatically reach existing clones. Do not delete an existing Worker, database, or credentials just to restart the installation.

**Does the button require Git?** Yes. The official flow connects GitHub/GitLab, creates a copy of the source in your account, and connects it to Workers Builds. You do not need to create a repository beforehand. Manual Wrangler deployment is a separate option without Git integration.

With Access enabled at deployment, even setup requires login. If omitted, only setup instructions can be public; the management UI and APIs remain blocked until configuration is complete. The first visitor never becomes an administrator automatically.

## Use

Use **Issue keys** (`/`) for issuance and **Accounts and networks** (`/connections`) for profiles and API tokens. On first use, add a profile, register a network and its token, then open issuance. Registration and verification errors appear beside the form with an error code. Single choices are selected automatically, and navigation preserves the selected connection.

- Create an account profile with a display name and expected owner, then register a tailnet identifier and **personal API access token (`tskey-api-`)**. Use a user-owned token, not OAuth credentials.
- Registration verifies access to the tailnet's key list. The expected owner is **administrator-supplied and unverified**. Successful listing does not prove the owner's identity or permission to issue keys. Token expiry dates are also administrator-supplied.
- Select an account and network, issue a key, check the selected connection, expected owner, and expiration, then copy and deliver it privately yourself.
- The server enforces single-use, preauthorized, non-ephemeral, untagged keys with a 24-hour lifetime. Tailnet Lock may require a separate signature. Keep existing security policies enabled.
- Register the same tailnet under different profiles with different users' tokens. All allowed administrators jointly manage every connection.
- Stored tokens are never shown again. Issued keys stay only in the current page's memory and are removed when cleared, switching connections, leaving or backgrounding the page, or reloading. Copied values may remain in the OS clipboard.
- Issuance is never retried automatically. Timeouts, incomplete responses, and `pending` audit records can mean the result is unknown. Check the Tailscale console and revoke unwanted keys before issuing another if needed.
- Personal API token expiry (up to 90 days), the issued key's 24-hour expiry, and device node key expiry are separate. Replace API tokens before they expire. [API authentication](https://tailscale.com/docs/reference/tailscale-api), [auth keys](https://tailscale.com/docs/features/access-control/auth-keys)

## Install as an app

After setup, open the configured app URL, sign in through Access, and select **앱 설치** in the header. Supported Chrome/Edge browsers can show a native install prompt; otherwise use the browser's install menu. On iPhone/iPad, use Safari → More/Share → Add to Home Screen, enable **Open as Web App** if shown, then Add. Installation guidance is hidden in standalone mode.

The manifest is fetched with credentials because Access protects it. Installation does not bypass Access: sign in again when requested. Reauthentication links preserve the selected profile and network. Registration, token replacement, and issuance require an online connection; requests are never queued or replayed. Keys and tokens are not restored when reopening. Install again at the new URL after switching domains. Actual iOS/Android installed-app authentication remains a device verification item.

## Architecture and security

Astro static pages, UnoCSS, a TypeScript Worker, and one D1 database. No frontend runtime framework, KV, R2, Durable Objects, service worker, or analytics scripts.

Tokens use AES-256-GCM with random 96-bit nonces and the connection ID as additional authenticated data. The master key is a Worker Secret separate from D1. Requests go only to the fixed Tailscale API host; redirects are rejected. Tokens and issued keys never go into URLs or persistent browser storage. Upstream response bodies are excluded from server errors.

Configure Worker-wide Access protection. The server additionally verifies JWT signatures, issuer, audience, expiration, and allowed administrator emails. It rejects domains outside the configured single origin. Static Assets Workers do not receive native `ctx.access`, so the server verifies JWTs directly. `run_worker_first` routes asset requests through the Worker too. [Access documentation](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)

Mutations require the correct Origin, JSON Content-Type, and a dedicated header. Cross-origin CORS is disabled. Atomic D1 updates enforce a five-second issuance interval per administrator and 30 seconds per connection. Every response uses `no-store`, including CDN cache controls. There is no offline issuance, secret request queue, or restoration of old keys after restart.

## Updates and operations

Use **Actions → Update Keyport → Run workflow** in your deployment repository to create a tested update PR, then review and merge it in GitHub. Cloudflare Builds deploys the production branch. See the [browser update procedure](docs/OPERATIONS.md#브라우저에서-업데이트하기) for one-time permissions and installation requirements. No local checkout or Cloudflare credentials in Actions are needed. Updating workflow files may require the optional repository-scoped GitHub token described in the procedure.

The [operations guide](docs/OPERATIONS.md) covers updates, rollback, token renewal, backup and recovery, encryption key rotation, and resource deletion. The [verification record](docs/VERIFICATION.md) distinguishes automated checks from outstanding live tests. Both documents currently use Korean. Domain terms live in [CONTEXT.md](CONTEXT.md); design decisions live in [ADRs](docs/adr/).

Upstream changes are not automatically merged into your cloned repository. Apply updates to the production branch connected to Workers Builds to trigger deployment. Preserve existing D1 binding IDs and Secrets.

Deleting a connection removes local credentials only. Existing auth keys and devices remain. Revoke external API tokens, unwanted keys, and devices separately in Tailscale.

## Local development

Bun 1.4.2 or later, plus Node 24 or later for Wrangler:

```sh
bun install --frozen-lockfile
bun run types
bun run check
bun test
bun run build
bun run db:local
bun run dev
```

Bun runs the test suite with `bun:test` and `bun:sqlite`, and runs Astro and TypeScript with `bunx --bun`. Wrangler uses `bunx wrangler`, which follows its Node shebang: forcing Wrangler onto Bun currently causes local requests to hang. Node 24 is retained solely for Wrangler; `.node-version` selects it in supported build environments. See the [upstream compatibility issue](https://github.com/cloudflare/workers-sdk/issues/15717). Cloudflare still runs the deployed app on Workers. Workers Builds detects the Bun lockfile; if selecting a Bun version explicitly, set the build variable `BUN_VERSION=1.4.2`.

Local development starts unconfigured and exposes only the setup wizard. There is no production authentication bypass. Tests use synthetic JWTs, temporary SQLite, and a mocked Tailscale API. Never put real tokens in test files or chat.

## Costs

As checked on October 19, 2026, a small administrator instance can start within Workers Free, D1 Free, and Access Free allowances. Free operation is not guaranteed.

| Resource | Free allowance / cost conditions |
| --- | --- |
| Workers | 100,000 requests/day and 10 ms CPU per invocation. Static requests also pass through the authentication Worker. Exceeding limits can cause failures; Paid adds a subscription and usage charges. |
| D1 | Five million rows read/day, 100,000 rows written/day, and 5 GB total storage. Free limits can restrict operations. Paid charges apply beyond included usage. |
| Access | Free for small teams. Check plan requirements for teams of 50 or more and additional features. |
| Builds | Build minutes, concurrency, and monthly allowances depend on the Workers Builds plan. |

[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Access pricing](https://www.cloudflare.com/sase/products/access/), [Builds limits and pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/). Domain, IdP, and Tailscale charges are separate. Include other account usage when assessing costs.

## License and references

MIT © 2026 ajchemist. [tailscale-x/tailscale-cloudflare](https://github.com/tailscale-x/tailscale-cloudflare) was reviewed, but its current structure differs from the referenced Worker project and no license could be confirmed, so no code was reused. No code or secrets from the private onboarding project are included.
