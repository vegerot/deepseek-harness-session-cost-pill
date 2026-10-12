# 💸 DeepSeek Harness Session Cost Pill

A DeepSeek Harness plugin that displays estimated API spend for the current session directly in the composer dock (`conversation.composer.dock`).

## Features

- **Live Spend Display**: Displays `💸 $X.XX` (or `<$0.01`) in the composer dock alongside turn/step count, speed, and token usage.
- **Detailed Tooltip**: Hovering shows the exact breakdown of:
  - Estimated total spend
  - Uncached input spend
  - Cache read (hit) spend
  - Output token spend
- **Modern Styling**: Uses semantic CSS units (`rem`) and perceptual `oklch` color formatting.
- **Zero Core Modifications**: Implemented 100% as a standard Cordis client-bundle plugin. Works seamlessly for both Web and Desktop profiles.

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
