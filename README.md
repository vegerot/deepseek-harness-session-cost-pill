# 💸 Session Cost Pill — DeepSeek Harness

**Live session spend, right in the composer dock.**

![Session cost pill in the DeepSeek Harness composer dock](https://raw.githubusercontent.com/vegerot/deepseek-harness-session-cost-pill/main/docs/pill-in-dock.png)

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
![tests](https://img.shields.io/badge/tests-33_passing-2ea44f?style=flat-square)
![build](https://img.shields.io/badge/build-none_required-4D6BFE?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

DeepSeek tells you how many tokens you burned. It does not tell you what that cost.
This plugin does — live, per session, without a single line of patched harness source.

---

## What you get

The composer dock already tracks turns, speed, tokens, and context. The cost pill joins that row:

| Pill | Shows |
|---|---|
| ⏱ activity | turns · steps · decode speed |
| 💾 usage | total tokens · cache-hit rate |
| **💸 cost** | **estimated spend for this session** |
| 🪫 context | context-window pressure |

The glyph climbs with the session total, so the row reads at a glance before the number does:

| 💸 | 💵 | 💰 | 🔥 | 🚨 |
|---|---|---|---|---|
| under $1 | under $5 | under $20 | under $100 | $100 and up |

**Click it** and the breakdown opens: uncached input, cache reads, and output, each priced separately, plus how much
of the total was charged at peak rates and how many steps that covered. It closes on Escape, on a click outside, or on
a second click — the browser's own popover behaviour, so the plugin ships no dialog state, listeners, or positioning
code of its own.

<p align="center">
  <img src="https://raw.githubusercontent.com/vegerot/deepseek-harness-session-cost-pill/main/docs/pill-cost.png" alt="The cost pill" width="330">
  <img src="https://raw.githubusercontent.com/vegerot/deepseek-harness-session-cost-pill/main/docs/panel.png" alt="The cost breakdown panel open above the pill" width="420">
</p>

![Full window with the pill running](https://raw.githubusercontent.com/vegerot/deepseek-harness-session-cost-pill/main/docs/session-window.png)

---

## Install

```bash
dsh plugin --profile web     add ~/code/github.com/vegerot/deepseek-harness-session-cost-pill
dsh plugin --profile desktop add ~/code/github.com/vegerot/deepseek-harness-session-cost-pill
```

That is the whole install. No build, no bundler, no dependencies. Restart the profile and refresh.

---

## Why the number is right

Most cost trackers multiply a session's tokens by one flat rate. That is wrong for DeepSeek twice over.

### 1. DeepSeek has peak pricing

Prices **double** during peak hours, so a single rate per model cannot price a session.

| Model | Tier | Cache hit input | Cache miss input | Output |
|---|---|---|---|---|
| `deepseek-flash` | off-peak | 0.003 | 0.15 | 0.60 |
| `deepseek-flash` | peak | 0.006 | 0.30 | 1.20 |
| `deepseek-v4-pro` | off-peak | 0.022 | 0.66 | 1.98 |
| `deepseek-v4-pro` | peak | 0.044 | 1.32 | 3.96 |

*USD per 1M tokens, transcribed from [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/).*

Peak is **01:00–04:00 and 06:00–10:00 UTC, Monday–Friday**. Everything else — all weekend — is off-peak.

So this plugin prices **every assistant step at the rate in effect for that step's own timestamp**. A session that
crosses a peak boundary gets a correctly blended total instead of a guess.

### 2. Cache hits dominate, and they are ~50× cheaper

A cache hit costs a fraction of a cache miss. A tracker that folds all prompt tokens into one bucket will miss the mark
badly on a long agent session — exactly the kind that reads 96% cache-hit.

### Verified against real billing

DeepSeek publishes no pricing API, but its Platform console reports authoritative cost. Checking this plugin's table
against one real account's October `deepseek-flash` usage:

```
tokens:  hit 140.56512M   miss 2.828971M   out 0.758458M
published all-off-peak total   = $1.301116
platform's own billed total    = $0.453778 + ¥6.0056894
                               = $1.301116 at FX 7.0877 CNY/USD
```

A **0.11% match**. The table is right, and that month's usage was effectively all off-peak — assuming peak would have
doubled the estimate.

---

## How it works

It is an ordinary [Cordis](https://github.com/deepseek-ai/deepseek-harness) client plugin. Nothing in the harness is
patched, forked, or monkey-patched.

```js
ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
  name: 'conversation.composer.dock',
  id: 'cost-pill',
  order: 2,            // joins the activity (0) and usage (1) pills
}, CostPill));
```

The pill reads the chat snapshot through the session standard kit and folds it:

- `useChat` → every settled assistant step, each carrying its own `time` and provider `usage`
- `useProjection('modelSelection')` → the session's model

```
total = Σ over steps  costOfUsage(step.usage, model, isPeak(step.time))
```

`isPeak` classifies one request from its UTC weekday and hour, so pricing is per-request rather than per-session.

---

## Known limits

Honest ones, not footnotes:

- **Chinese public holidays are off-peak in full, and this is not modelled.** That needs a PRC holiday calendar, so
  weekday windows falling inside a holiday week are priced as peak — slightly overstating those days.
- **The model is priced at session level.** Chat assistant nodes carry `time` and `usage` but not the
  model, so a session that switched models mid-way prices every step at the most recently used model's rates.
- **Account-level spend is not shown.** DeepSeek's Platform console does expose real billed cost through private
  endpoints that authenticate with `x-dsh-auth-token` (not `Authorization: Bearer`), and DSH already
  holds that grant via `getPlatformSession()`. It is deferred here because the browser half of a Remote needs
  generated zod codecs.

---

## Development

```bash
pnpm test        # tsc --noEmit && node --test test.ts
pnpm typecheck   # the type check alone
```

**Types without a build step.** `client.js` ships as plain JavaScript on purpose: the harness injects plugin
bundles into the page as a **classic script** (`<script src>`, no `type="module"`), so the file reaches
the JS engine verbatim. There is no build step and no runtime type stripping on the browser side.

Types therefore live in **JSDoc annotations**, verified by `tsc --checkJs`. Real, CI-visible checking with no
toolchain. `test.ts` is different — Node strips its types natively.

The suite pins the behaviour that matters:

- peak windows, both edges, the mid-day gap, and weekends
- published rates for both models, off-peak and peak
- **one off-peak plus one peak step in a single session**, asserting the summed per-step rates — the case a
  session-wide total provably cannot produce
- an unpriced model renders no pill rather than a wrong number

---

## License

MIT — see [LICENSE](LICENSE).
