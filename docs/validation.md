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

## Local evidence-check preparation — 2026-10-12

This section records the pre-publication local preparation checkpoint. At that checkpoint the work had not been pushed or published and all new source material was explicitly synthetic. No stock list, user chat, account data or historical attribution ledger was imported. The later public-source example is described separately below.

- 57 Node tests passed (42 existing plus 15 evidence-check groups), 0 failed. New behavior tests cover source removal, root/repost deduplication, missing timestamps and values, stage mismatch, conflicting totals, future evidence, as-of revisions, candidate confirmation, strict schemas, consistent input snapshots, deterministic reports, and a CLI run with an empty environment.
- 9 existing browser acceptance groups and 7 new evidence-workspace groups passed in Chromium 134, using isolated offline profiles sequentially. Both suites recorded 0 external requests and 0 JavaScript errors. The new path was exercised at 320, 390 and 1440px widths, with desktop/mobile screenshots visually inspected.
- Actual CLI checks produced supported → supported for the public fixture, supported → unknown after deleting the issuer's origin group, and unknown with an explicit conflict in all-source mode. Exports include the full synthetic input, both evaluations and hashes; runs were recorded in a verifiable local journal.
- All 51 allowlisted files passed the bounded pattern scan. The source ZIP contains exactly those 51 files. Runtime logs, local screenshots, Library inputs, dependency installation, earlier research references and raw verification logs remain outside the public package.
- All 6 Skills passed the skill-creator structural validator with task-local PyYAML 6.0.3. An independent evaluator completed 18 new synthetic paper tasks without reading the source example answers and reported no incorrect decisions or unauthorized actions in those cases. Two non-blocking wording gaps were identified (separate forecast-window states and skill-author versus task-material attribution); narrowly clarified in Skills v0.1.1. This is one evaluator, without repeated/model/no-skill controls: it does not measure a skill advantage, real-user efficacy or runtime discovery compatibility. Two targeted follow-up paper cases on v0.1.1 completed without unresolved skill issues; these were regressions for known findings, not another blind pass. The original source examples remain specifications, not test results.
- The separately supplied existing Python framework passed its 23 synthetic tests in an isolated reference copy. Its code was not duplicated into this UI or used to invent new real-market results.

The environment initially blocked the isolated Chromium launch; a scoped approved launch completed. An old browser regression assumed the strategy tab remained selected after reload; that test navigation was updated for the new default evidence tab and both suites then passed. A temporary execution-service disconnect did not produce output; the completed rerun is the result reported above. These issues and their recovery are not presented as first-attempt successes.

Still unimplemented: real-source ingestion, strict price-only signal ablation, historical N3 evidence review, real return validation, paid model calls, phone execution and public release of this local change.

## Local provenance repair and public case — 2026-10-12

The earlier reverse audit found a real gap: ten AI repeats, manually confirmed and assigned different origin labels, could keep a conclusion supported after deleting the original. That finding remains archived. Evidence engine 0.2.0 / dataset schema 2 now uses explicit provenance roles, content-addressed parent nodes and a separately bundled synthetic root registry. AI/reposts are always trace-only; human confirmation cannot register independent roots. This is not immutable storage or real-world authenticity verification: forged links to known roots and edited files/code/registry remain outside the trust boundary.

- 76 Node tests passed, 0 failed: the prior 57 plus 15 provenance groups and 4 public-case boundary/integrity groups. Added counterexamples include ten renamed confirmed AI repeats, ten ungrounded AI answers, rehashed invented primary roots, in-place role edits, self/multi-node cycles, missing root/intermediate/leaf nodes, absent primary evidence, public laundering of private ancestry, multi-generation retellings, separately registered roots, primary aliases, export replay, duplicate nodes, old-schema rejection and derived version inflation.
- A separate seven-case local audit replayed the former exploit: after deleting the primary, the result is now unknown with 0 usable roots; ten retellings resolve to 1 root; two separately registered primary sources resolve to 2, or 1 after removal. It also verified cycles, broken parents, rehashed unregistered roots and export replay. These are synthetic cases, not real source authentication.
- 9 original browser groups and 9 evidence/public-case groups passed sequentially in isolated Chromium 134, offline, with 0 external requests and 0 JavaScript errors. Source role/parent-chain/registry export and the separate public-case export were checked. Both new tabs fit 320/390/1440px; public-case desktop/mobile screenshots were visually inspected.
- The public case uses directly reviewed official PDF text and the public news discovery page, concise self-written summaries and exact page locators. It is separate from the synthetic engine. The known public dates, report dates and financial periods are distinct; unverified first-public timestamps and official-document byte hashes remain null. No return test, price-only ablation or private-data alpha was performed. A direct official PDF download returned HTTP 403; no bypass or private cached copy was used. Verification used publicly accessible source text instead.
- All 57 allowlisted files passed the bounded scanner; the updated local source ZIP contains exactly those files. Raw audit evidence, previous source ZIP, screenshots, and source-transfer attempts stay outside that package. No third-party PDF or article copy is packaged.

These checks completed before the GitHub source-delivery step. The original checkout and base commit are retained. Refer to this branch's commit and PR state for subsequent publication/merge status; these local checks do not imply website deployment or validated alpha.
