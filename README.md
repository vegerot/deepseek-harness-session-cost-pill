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

Runs tests using Node's native test runner with TypeScript support (`node --test test/*.test.ts`).

## Installation

Install into your profile (e.g. `web` or `desktop`):

```bash
dsh plugin --profile web add ~/code/github.com/vegerot/deepseek-harness-session-cost-pill
dsh plugin --profile desktop add ~/code/github.com/vegerot/deepseek-harness-session-cost-pill
```
