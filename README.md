# 💸 DeepSeek Harness Session Cost Pill

A DeepSeek Harness plugin that displays estimated API spend for the current session directly in the composer dock (`conversation.composer.dock`).

## Features

- **Live Spend Display**: Displays `💸 $X.XX` (or `<$0.01`) in the composer dock alongside turn/step count, speed, and token usage.
- **Per-Request Pricing**: Every assistant step is priced at the rate in effect for *its own* timestamp, so a session
  that spans a peak boundary is not charged a single blended rate.
- **Detailed Tooltip**: Hovering shows the exact breakdown of:
  - Estimated total spend
  - Uncached input spend
  - Cache read (hit) spend
  - Output token spend
- **Modern Styling**: Uses semantic CSS units (`rem`) and perceptual `oklch` color formatting.
- **Zero Core Modifications**: Implemented 100% as a standard Cordis client-bundle plugin. Works seamlessly for both Web and Desktop profiles.

## Pricing model

Rates are USD per 1M tokens, transcribed from [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/):

| Model | | Cache hit | Cache miss | Output |
|---|---|---|---|---|
| `deepseek-flash` | off-peak | 0.003 | 0.15 | 0.60 |
| | peak | 0.006 | 0.30 | 1.20 |
| `deepseek-v4-pro` | off-peak | 0.022 | 0.66 | 1.98 |
| | peak | 0.044 | 1.32 | 3.96 |

Peak is **01:00–04:00 and 06:00–10:00 UTC, Monday–Friday**; everything else is off-peak. DeepSeek has no cache-write
charge, so `cacheWriteTokens` is not priced.

The retired `deepseek-chat` and `deepseek-reasoner` aliases carry no rate — `GET /models` now returns only
`deepseek-flash` and `deepseek-v4-pro`, and an unpriced model renders no pill rather than a wrong number.

### Known limits

- **Chinese public holidays are off-peak in full**, and this is not modelled: it would need a PRC holiday calendar.
  Weekday windows falling inside a holiday week are therefore priced as peak, slightly overstating those days.
- **The model is priced at session level**, from the `modelSelection` projection. The chat snapshot's assistant nodes
  carry `time` and `usage` but not the model, so a session that switched models mid-way prices every step at the
  most recently used model's rates.

### Validated against real billing

DeepSeek exposes no public pricing API, but the DeepSeek Platform console does report authoritative cost. For this
account's October `deepseek-flash` usage (hit 140.56512M, miss 2.828971M, out 0.758458M tokens), the published
all-off-peak total is $1.301116, while the platform's own billed total (`$0.453778398` + `¥6.0056894`) converts to
**$1.301116 at FX 7.0877 CNY/USD** — a 0.11% match. That independently confirms the table above, and confirms the
usage was effectively all off-peak (assuming peak would have doubled it).

### Deferred: account-level spend

Real billed cost (rather than this estimate) is reachable, but is **not** implemented here. Recorded so a future
attempt does not re-derive it:

- DeepSeek has **no public pricing API**. `GET /models` returns capability metadata only, `POST /chat/completions`
  returns token counts with no cost field, `GET /user/balance` returns balance with no rates, and `/pricing`,
  `/models/pricing`, `/usage` are 404 with no OpenAPI spec published.
- The **Platform console** does have working private endpoints, authenticated with `x-dsh-auth-token: <grant>` (not
  `Authorization: Bearer`), plus `x-client-platform: web`:
  - `GET platform.deepseek.com/api/v0/users/get_user_summary` — wallets and `total_costs` in USD and CNY.
  - `GET platform.deepseek.com/api/v0/usage/cost?month=<m>&year=<y>` — per-model, per-bucket cost, in per-currency
    blocks each carrying `currency`, `total`, and 31 daily buckets. `usage/amount` returns the same shape in tokens.
  - These are undocumented dashboard internals and may change without notice.
- DSH already holds the grant: `ctx.deepseekAccount.getPlatformSession()` is Host-only and returns
  `{ origin, token, userId, requestHeaders? }`. The account service exposes no usage or cost method, so a Host half
  must fetch these endpoints itself.
- **Why it is not built:** a Host half *can* register a Remote buildlessly — `@Remote` is sugar over a string-keyed
  prototype property (`'@deepseek-ai/dsh-typert-protocol/remote-methods'`), which plain JS can define directly, and
  `bindTypertRemote()` needs no compiler metadata. But the **browser half cannot consume** a Remote without generated
  zod codecs, so it needs the Typert generator or bundled `zod` — ending the buildless single-file design. Doing it
  buildlessly instead means a `ctx.webServer.register` route plus a same-origin fetch, which puts the data on a
  loopback route outside the app's session auth.

## Testing

```bash
pnpm test
```

Runs `tsc --noEmit` and then Node's native test runner. `pnpm typecheck` runs the type check alone.

## Types without a build step

`client.js` ships as plain JavaScript on purpose. The harness injects plugin bundles into the page as a
**classic script** (`<script src>` with no `type="module"`), so the file reaches the JS engine verbatim — there is no
build step and no runtime type stripping on the browser side.

Types therefore live in **JSDoc annotations** (`@typedef` / `@param` / `@returns`), which `tsc --checkJs` verifies via
`tsconfig.json`. This gives real, CI-visible type checking with no toolchain.

`test.ts` is different: it runs under Node, which strips types natively, so it can use TypeScript syntax directly.

Note that decorators and `enum` are *not* erasable, so they fail under Node's strip-only mode. Any future Host half
needing a `@Remote`-decorated service must use the non-decorator registration route or a build step.

## Installation

Install into your profile (e.g. `web` or `desktop`):

```bash
dsh plugin --profile web add ~/code/github.com/vegerot/deepseek-harness-session-cost-pill
dsh plugin --profile desktop add ~/code/github.com/vegerot/deepseek-harness-session-cost-pill
```
