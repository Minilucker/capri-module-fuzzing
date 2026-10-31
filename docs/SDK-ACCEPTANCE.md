# SDK redevelopment acceptance — 31 October 2026

Module **0.6.0**, SDK **0.1.1**, and dashboard **0.22.0** are deployed on the Windows and Ubuntu test hosts. The implementation provides the workspace Fuzzing page with Runs, Wordlists, Vocabulary, Tasks and Settings, plus the SDK-based runtime and its core tool extensions. The original redevelopment kept activation unchanged. The operator subsequently enabled fuzzing in development on both hosts; see [live acceptance](LIVE-ACCEPTANCE.md) for the resulting native and provider checks and the unresolved Burp truncation limitation.

Runtime source: module `ac72d3d`; installed-test additions through `07306b4`. Framework runtime: `408dc09`; installed shell test adjustment: `98ef1ec`. Subsequent documentation-only commits do not change those runtime builds. Both hosts reported completed maintenance upgrades.

## Verified

| Check | Windows | Ubuntu |
|---|---|---|
| Public-SDK module unit suite | 11 passed | 11 passed |
| Module UI with shared SDK renderer and synthetic operations | Passed | Passed |
| Packed SDK consumer | Passed | Passed |
| Module isolated from the framework checkout, using packed SDK | 11 passed | Not separately repeated |
| Installed core-image module acceptance | Passed | Passed |
| Optional dashboard-image production component bundle | Passed | Passed |
| Framework regression suite, with synthetic module fixtures | 501 passed | 501 passed |
| Final installation/SDK/release consistency tests | 13 passed | 13 passed |
| Shared SDK browser widgets | Passed | Passed |
| Installed host-MCP/container shell UI and session read | Passed | Passed after native reconnect |

The 13 final tests overlap the larger suite and include the new release-consistency check; these are not 514 distinct tests. Both hosts run Linux containers. Native host tests cover Windows and this Ubuntu installation, not every Linux distribution.

### Module/runtime coverage

- Immutable generated revisions; hash checks; observed/inferred provenance and batch readers; vocabulary searches; explicit container-file previews; independent cancellation; three concurrent large reads and three concurrent result views.
- Explicit ffuf inputs, named revision verification, preservation of false/zero defaults, no implicit wordlist default or duplicate core scan, filtered pagination/cursors, malformed output diagnostics and retained raw evidence.
- Installed snapshot loading with enabled/disabled workspaces and a full child override. Generated specialist/skill files and component declarations are checked against applied state.
- Actual module storage/files survive a configuration reapply; module cleanup leaves core's framework receipts intact.
- Real ffuf processes against a local fixture, including two concurrent scans, independent cancellation of a slow scan, exact input revision, and output collision rejection. No external targets are used.
- Actual core notification observation and delivery, with synthetic capture evidence and synthetic native identity metadata: initiating specialist primary, main secondary. This is not a live Desktop identity test.
- CLI management HTTP tool execution without the dashboard. Component compilation is separately tested in the optional dashboard image, whose code is deliberately absent from the core image.

### UI coverage

The real module page and SDK widgets were exercised with synthetic core responses: all five tabs, explicit revision choice, read-only previews, provenance, settings preview/confirmation, async summaries, disposed searches, and narrow 390 px rendering. Browsing/forms do not start scans. Generic sidebar/component scope and configuration receipt handling have separate framework tests with synthetic modules.

The installed host-MCP-to-container shell check passed on both hosts using the actual shipped HTML and the shared AppBridge renderer, including navigation, installed tool forms, session reads and 320/390 px layouts. On Linux, the first attempt failed the session-list read because Desktop's remote daemon socket had disappeared during the rebuild. The operator restarted Desktop/reconnected; the unchanged check then passed with no page errors. No replacement daemon or implementation workaround was added. This shell harness is not proof of a native Desktop operator selecting the newly enabled module page.

## Remaining live qualification

The subsequent [live acceptance](LIVE-ACCEPTANCE.md) proves Caido and native lifecycle behavior on both hosts and the small-record Burp workflow on Windows. Still outstanding:

- Burp history with large records: the Linux check is blocked by malformed, truncated upstream JSON. An upstream syntax fix alone does not restore the omitted response content.
- Operator navigation of the newly enabled Fuzzing page in the native Desktop side panel on both hosts, including reopen/workspace switches and the full keyboard/320 px cases. Browser-based UI tests are distinct evidence.

The original automated pass enabled no workspace, started no model and switched no proxy. The subsequent operator-authorized live pass did enable development, start native specialists and switch providers sequentially; its separate evidence records the outcomes and restoration.

## Evidence and reproduction

Module-owned scripts are `test/*.test.mjs` (via `npm test`), `test/dashboard-browser.mjs`, `test/installed.mjs`, and `test/bundle.mjs`; see the README for invocation. Framework tests never import the real module.

Ignored evidence is retained locally: module `.capri/unit*.log`, `.capri/acceptance/fuzzing-ui-*.json` and screenshots; framework `.capri/fuzzing-framework-*.log`, `.capri/fuzzing-installed-*.log`, `.capri/fuzzing-bundle-*.log`, `.capri/fuzzing-release-final*.log`, and `.capri/fuzzing-installed-shell-*.log`. The Windows standalone consumer record is `.capri/acceptance/fuzzing-standalone-win32.json` in the framework checkout. Temporary installed-test workspaces and dashboard module copies are removed after the tests.

To use the page, refresh Capri's plugin connection if it still advertises an older dashboard, enable/apply `fuzzing` in the chosen workspace, and select **Fuzzing** in that workspace's sidebar. This is an explicit activation, not a global change.
