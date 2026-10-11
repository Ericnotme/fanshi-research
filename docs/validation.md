# Validation record

Release checks are run locally before publishing. Raw screenshots and execution outputs stay outside the public allowlist; only this summary is public.

## Implemented check scope

Core tests cover deterministic synthetic data, strict DSL and search budget, invalid prices, future perturbation invariance, hand-calculated round-trip costs, initial-equity drawdown, peak-to-trough drawdown, cash baseline, monotonic cost drag, rejection of leverage, final-segment selection independence, no-candidate fallback, complete candidate retention, reproducible protocol hashes, integer pool conservation, provider mock/refusal/incomplete handling, phone public-only boundaries, hash-chain tampering, partial journal records, exclusive-writer lock and MCP handshake.

Browser checks use one independent headless browser and one page, offline `file://`, sequential desktop and mobile layouts. They exercise recalculation, export, persistent experiment logs, prize conservation, invalid inputs and capability labels. No existing foreground tabs or personal browser profile are used.

The public-file scanner checks only `PUBLIC_FILES.json`, rejects runtime/private paths and symlinks, searches common credential patterns and records file hashes. This is a bounded release check, not a claim that arbitrary future imports are safe.

## Not verified

No paid model call, real market dataset, financial account, real order, device connection, actual mobile app navigation, prospective market observation, financial performance, statistical significance, real user time saving or production security certification has been performed.

## Checked on 2026-10-11

- 42 automated tests passed, 0 failed, including 18 server-provider test groups with mock HTTP. Coverage includes strict requests, bounded retries/deadlines/response streams/budgets, quota/auth/refusal/invalid output, secret-free errors, concurrency, audit failure, provenance and unchanged local evaluation.
- 9 browser acceptance groups passed, using Chromium 134 in one isolated headless process. Tested all panels at 320, 390 and 1440px widths with no horizontal document overflow.
- 0 JavaScript errors and 0 external network requests during offline browser checks.
- 32 explicitly allowlisted source files passed the final privacy-pattern scan, including the server adapter, mock-network tests and provider documentation.
- Desktop and mobile screenshots were visually inspected. Paper ledger and full JSON export were checked.
- The default seed 42 happens to lose money in the final synthetic segment. It was retained without tuning or hiding the loss.

These are engineering checks only. None changes the prospective status or validates financial performance.
