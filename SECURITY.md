# Security and privacy boundary

The published demo has CSP `connect-src 'none'`, contains only synthetic data, and works from a local file. Offline CLI and MCP entrypoints do not import the network adapter. External documentation/portfolio links are ordinary user-initiated navigation. There is no brokerage adapter, financial account login, order submission, funds transfer, analytics, upload endpoint or device driver.

An optional Node-only Responses HTTP adapter is available through a separate explicitly enabled CLI. Only that path lazily reads the user's `OPENAI_API_KEY` environment variable; it never loads credential files, browser sessions or keychains. It sends a fixed synthetic hypothesis prompt to the official endpoint, refuses redirects/custom endpoints, caps requests/output tokens/body size, and reserves an estimated spend allowance before each attempt. Estimates are not provider billing guarantees or cross-process limits. Timeouts/network failures are not automatically retried, since remote billing may already have occurred. No real credentials or paid API calls were used in release validation. See [provider limits](docs/openai-provider.md).

Model output is untrusted data. Only eight bounded parameter combinations are admitted; executable text is not evaluated. The evaluator is fixed source code. Refusals, incomplete responses, unknown fields, duplicate candidates and expanded search budgets fail closed. API audit events never persist request headers, keys, raw response bodies or refusal text. Journal write failures stop the provider. Runtime files must remain local; do not expose this adapter as an unauthenticated web endpoint.

The phone module is a non-executable plan interface. Its public/private-context flags are caller declarations, not a verified privacy classifier. It must not be wired to a device without an independently reviewed public-page boundary and explicit authorization. Unknown or personal contexts stop the plan. No financial account action exists.

Browser storage is local, mutable and limited to synthetic experiment metadata. Node logs have an integrity hash chain and an exclusive writer lock; an administrator can rewrite them and recompute hashes. A crash may leave a lock or partial record. Preserve the files and inspect them before recovering; do not delete history just to get a green check.

Publish only paths in `PUBLIC_FILES.json`. Runtime logs, private files, credentials, screenshots of personal pages, local config, raw research data and Git history from other projects must never be copied. The included scanner is a useful pattern check, not a guarantee of privacy or a security certification.

Use GitHub issues for non-sensitive reproducible bugs. Do not paste credentials, personal financial data or device identifiers into issues.
