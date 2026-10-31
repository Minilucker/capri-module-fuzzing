# Fuzzing module — SDK redevelopment and dashboard plan

Status: phases 1–4 implemented and deployed; phase 5 automated runtime/CLI/UI checks passed on Windows and Linux. Real Caido and native specialist hold/resume/stop checks passed on both hosts; Windows's small-record Burp workflow passed. Linux Burp history is blocked by upstream JSON truncation. Native operator panel qualification remains separate. See [live acceptance](LIVE-ACCEPTANCE.md). Updated 31 October 2026.

Implementation: module 0.6.0, SDK 0.1.1, dashboard 0.22.0. Existing migrations and business lineage are preserved. Module tests use the public SDK harness; explicit browser/installed integrations remain module-owned. Live provider/native-specialist acceptance is separate from synthetic identity tests.

The [acceptance record](SDK-ACCEPTANCE.md) distinguishes completed checks from remaining observations. Source and runtime support are deployed on both hosts; no existing workspace was enabled as a side effect.

Redevelop the existing module around Capri's SDK while retaining its useful contracts. Give it a dedicated **Fuzzing** section in the selected workspace's dashboard. Backend operations remain available without the dashboard or Desktop.

## 1. Verified starting point

Reviewed module commit `d9f288c`, manifest version `0.5.1`, against SDK `0.1.0` and dashboard `0.21.0`.

- The module already extends `fuzz_run` and `fuzz_result`; it does not need another ffuf runner. Core owns scan execution, output reservation, raw evidence and result-view lifecycles.
- It owns vocabulary, inferred candidates, immutable wordlists, and asynchronous wordlist read/export operations. Its specialist starts manually by default.
- It has no declared dashboard component or SDK peer dependency. Runtime imports still use `@capri/module-api`, `@capri/module-utils` and `@capri/fuzz-results`.
- Its tests import private framework files through `CAPRI_FRAMEWORK_ROOT`/checkout discovery. Replace that dependency in ordinary module tests with the SDK harness.
- `fuzzing_words` returns source batch IDs, but there is no public batch-detail reader for their explanations/excerpts. Wordlist task IDs can be polled, but there is no task-list tool to rediscover them after reopening a page.
- `package.json` says `0.5.0`, while the manifest says `0.5.1`. Align release metadata during implementation.
- The SDK does not yet expose the shared full-result iterator used by this module. Core's result reader also has an existing 256 MiB JSON-index boundary; larger artifacts remain available as raw files. Do not mistake that diagnostic for an empty successful result.
- The current arbitrary-wordlist reader is workspace-relative. Core's input suggestions also include system dictionaries, so the new UI must not promise those are previewable without implementing explicit container-path reads.

## 2. Ownership and behavior to preserve

| Concern | Owner and approach |
|---|---|
| Proxy history | Core `proxy_traffic_read`, using the configured Caido/Burp MCP integration. No second provider adapter or module capture database. |
| Extraction and inference | The agent reads captures, extracts observations and infers candidates. MCP stores the supplied words and provenance; it does not infer words. |
| Vocabulary and wordlists | This module's database, tools, workers and files. |
| ffuf execution | Core's existing fuzzing family, extended by the module. Retain one scan receipt and one process per requested run. |
| Enhanced result analysis | Module filtering/presentation over core's shared result reader/index, inside core's existing result-view lifecycle. |
| Notifications and identity | Core's observers, native caller identity and inbox. The module writes business state and never emits notifications itself. |
| Agent coordination | Native main/subagent delegation. No module supervisor, duplicate agent registry or dashboard chat interface. |
| Dashboard | A module-owned component using SDK widgets and existing tool/management APIs. |
| Dependency installation | Core installs and deduplicates declared requirements during the existing build workflow. No installation at activation or page mount. |

ffuf remains **direct only**, with proxy options absent from its exposed interface. Preserve native `FUZZ`/custom markers, multiple explicit wordlists, named options, output collision rejection/reservation and explicit-input precedence. Wordlists are never chosen implicitly from defaults or an implicit latest revision. There is no new concurrency limit, shared job queue or default execution deadline.

Each scan, result view, wordlist read and export retains its own asynchronous operation and cancellation state. A family can maintain a registry of its runs; that registry is not a serial execution loop. Short metadata reads can return directly; indexing, export and substantial analysis remain asynchronous workers.

Qualification must include overlapping large file/index builds, not just tiny fixtures. Existing SQLite caches have a single writer; check actual contention and fix any demonstrated long-held index transaction at the cache layer rather than adding a module-wide queue or reducing job concurrency.

Keep storage under:

```text
<workspace>/.capri/
  modules/fuzzing.v1/
    module.sqlite
    wordlists/<name>/r000001.txt
    wordlists/<name>/r000001.json
    cache/index.sqlite
  core/fuzzing/
    <run-id>/...
    results-index.sqlite
```

No duplicate raw response archive, result index or findings store. Fuzzing hits are observations, not automatically confirmed vulnerabilities.

## 3. Small framework/SDK changes needed first

### Supported result-reader export

Add a Node-only `@capri/sdk/fuzzing` entry point exposing the existing `openFuzzResultRecords` and `readFuzzResultPage` contracts, with typed results and explicit `close()` ownership. Move the shared implementation into the SDK package and have core use that implementation too; do not copy its parser/index into the module.

Document/type the already-supported `api.fuzzing.start`, `execute`, `result`, `read` and `resolve` helpers sufficiently for this module's preparation and analysis stages. These continue to use core-owned runs and views. Do not emulate these stages by creating another run or repeatedly polling every unfiltered result page.

Target an additive SDK release such as `0.1.1`; require the actual released version in the module's peer range. The new package must pass independent packed-package tests. This change does not itself remove the existing large-JSON indexing boundary; retain its explicit raw-artifact diagnostic. Streaming very large JSON is a separate core improvement.

After migrating and auditing installed consumers, retire the old `@capri/fuzz-results` alias if no consumers remain. Do not remove the other old aliases while `dev` still uses them.

### Generic module navigation

Currently a workspace component is reached through **Module pages**. Add a generic navigation entry for each active workspace component, using the existing catalogue, title, package fingerprint and component ID. The fuzzing manifest then produces a **Fuzzing** entry without a hardcoded core check for this module.

- Use the existing component renderer and shared side-panel layout; no fullscreen transition or new host/container adapter.
- Mount only the selected page. Remove/dispose entries on workspace changes, disablement or applied-package changes; preserve keyboard navigation and disambiguate duplicate titles.
- Retain Module pages as the catalogue. Direct entries and catalogue links must open the same component instance, not mount duplicates.
- Support an arbitrary number of components through the existing scrollable navigation.
- Test this framework behavior using synthetic component packages only.

## 4. Module refactoring and tool surface

Use a small activation entry point and ordinary imports. A suggested organization is:

```text
module.json                       # API 2, storage, overrides, workers, role, skill, page
package.json                      # SDK peer; module-owned development dependencies
src/
  index.mjs                       # Registration/composition only
  vocabulary.mjs                  # Observations, candidates, queries and provenance
  wordlists.mjs                   # Export/read registration and revision handling
  wordlist-lifecycle.mjs           # Independent run controllers and retained calls
  overrides/run.mjs
  overrides/result.mjs
  results-contract.mjs
workers/                          # Export, read/index and result-analysis workers
agents/fuzzing.toml
skills/fuzzing/SKILL.md
dashboard/
  workspace.mjs                   # mount/dispose and local section selection
  runs.mjs
  wordlists.mjs
  vocabulary.mjs
  tasks.mjs
  settings.mjs
001-schema.sql                    # Existing applied migrations remain unchanged
002-wordlist-tasks.sql
upgrade-clean.mjs
test/                             # SDK-based module tests and explicit acceptance
docs/
```

This is organization, not an additional loader format. Do not register placeholder hooks, MCP servers or workers that the module does not need.

| Surface | Planned change |
|---|---|
| `fuzz_run` extension | Preserve explicit options/default precedence and exact generated revision/hash verification within the single core-owned run. Use `base.execute` for baseline execution; calling the same effective tool through `api.tools.call` inside its override would recurse. |
| `fuzz_result` extension | Preserve baseline output when extras are absent; retain filters-before-pagination, compact/summary/table views, selected fields and source/query-bound cursors. Use the SDK shared reader in a worker. |
| Core family controls | Reuse `fuzz_options`, `fuzz_status`, `fuzz_list`, `fuzz_cancel` and `fuzz_input`; do not add competing controls or IDs. |
| Existing vocabulary/wordlist tools | Preserve current names and receipt/result protocols. Use SDK registration/schema/retained-call helpers and native Node utilities where no SDK abstraction is needed. |
| `fuzzing_batches`, `fuzzing_batch` — new | Paginated batch discovery and exact provenance detail: capture IDs, supplied excerpts, source batches and inference explanations. Read existing business records. |
| `fuzzing_wordlist_tasks` — new | List read/export tasks with their original attribution and native state so agents and the dashboard can recover visibility after reopening. No centralized job API. |
| Vocabulary search | Add explicit backend query/filter options to `fuzzing_words`/batch listing, with filtering before pagination. Searching must not silently search only the displayed page. |
| Wordlist file reads | Support explicit container paths, including system wordlist files, while keeping relative paths workspace-relative. Return the resolved path and hash; do not interpret a Windows host path as a container path. Validate regular files, normalize cache keys and test external-file previews using synthetic files. |
| `fuzzing_settings` | Keep as an applied read. Configuration writes use existing operator management APIs, not an agent-exposed settings mutation tool. |

Module-generated files retain exclusive revision reservation and integrity checks. SDK `writeArtifact` can replace a file atomically; it is not a substitute for immutable export/collision handling. Do not turn streaming exports into one giant in-memory string just to use that helper.

Keep `fuzzing.v1` business schema `1.1.0` where possible: the proposed readers use existing tables. Never edit applied SQL migrations. If an actual business-schema change becomes necessary, add a migration and update/test the core observer's compatibility explicitly before applying it. Unknown notification coverage must warn; incompatible known coverage must fail visibly.

## 5. Dedicated workspace dashboard

Declare one component:

```json
{
  "dashboard": {
    "api": 1,
    "components": [
      {"id":"fuzzing","title":"Fuzzing","scope":"workspace","entry":"dashboard/workspace.mjs"}
    ]
  }
}
```

It appears only for a workspace whose **applied** configuration enables this package. No global fuzzing page in this release; the existing global Modules screen continues to manage installed packages.

```text
Workspace selector                     [Current chat workspace]
Sidebar       Fuzzing · selected workspace · applied module version
              Runs | Wordlists | Vocabulary | Tasks | Settings
Fuzzing       [New run] [Refresh]
              Saved/active runs → selected run → results and raw references
```

| View | Operator experience | Backend |
|---|---|---|
| Runs | Saved/active runs; new-run form; status, explicit cancellation and result details. Show process exit code, view state and artifact references separately. | Effective `fuzz_*` tools. |
| New run | Target URL/marker field, explicit input choice, generated name+revision picker or native file/marker rows, suggestions and advanced named ffuf options/JSON. Preview effective inputs; never submit while editing. | SDK `toolForm` using the currently selected provider's schema and suggestions. |
| Results | Status/size/word/line/URL filters, field selection, paginated table and complete-match summary. Apply filters explicitly; reading results never sends target traffic. | Extended `fuzz_result`, followed by its existing `view_id` protocol. |
| Wordlists | Completed names/revisions, counts, hashes, paths and provenance; generate from selected vocabulary; read-only paginated preview; use an explicit revision in a new run. | Existing generate/list/read tools and receipt polling. |
| Vocabulary | Separate observed and inferred terms; server-side search; batch details, evidence references and inference explanations. | Vocabulary and new batch readers. |
| Tasks | Pending/finished wordlist reads and exports, original requester, errors and explicit cancellation. Reopen without losing task visibility. | New task list plus existing read/export controls. |
| Settings | Applied autonomous-discovery preference and ffuf defaults; inherited versus local values; preview/apply or clear a local override through existing core settings flows. Link to the existing source editor for global prompt/skill edits. | Existing settings management and `fuzzing_settings`. |

Use SDK sections, forms, tables, notices, buttons, literal JSON views and CodeMirror. Wordlist previews are read-only; no silently mutable generated revisions. Use the current Capri theme and rounded components, with narrow side-panel and keyboard support.

Important details:

- Keep selection bound to the selected workspace/generation, not the current chat. A changed provider must change the form, or produce an explicit unsupported-provider message; never silently call the baseline instead.
- The existing named generated-wordlist input verifies one revision. Native multiple-input mode remains explicit `options.wordlists` with markers. Do not silently downgrade a verified named revision to an unverified path or invent a new input mode.
- Display accepted, cancelling, exited/failed, view-ready and export-completed states accurately. An empty reserved output is not a completed result; a cancellation request is not termination.
- Poll visible work with no overlapping UI reads, and stop UI timers on disposal. This is view cleanup, not a cap on backend jobs. Closing the panel does not cancel accepted work.
- UI operations use the operator route. They do not fabricate agent recipients or acknowledge agent inboxes.
- Source excerpts and target content render as text. Selecting a result does not navigate to the target. Suggestions never become implicit defaults.
- No UI-based inference engine, duplicate agent messaging controls, automatic findings, global task scheduler or module-owned backend.

## 6. Specialist and skills

Keep the concise `fuzzing` role and workspace-wide skill. All agents in an enabled workspace can use the tools and skill; the specialist is a delegation option, not an exclusive access boundary.

Its workflow remains: read query-time proxy captures → store observations → infer candidates itself → generate a revision → perform assigned direct discovery → analyze saved results. Each history query is a bounded snapshot; no continuously mutating stream or filesystem watcher is required.

Preserve manual start by default and existing explicit workspace preferences. When the main agent assigns ongoing monitoring, the specialist should continue until stopped/held or its explicitly supplied end condition is met. Do not require an artificial fixed duration. Track processed provider-record/content identities where available, linked to immutable batch/capture references: a new capture handle for unchanged traffic must not by itself cause another cycle of inference and fuzzing. Use normal native cooperation/inbox behavior to advertise meaningful outcomes without interrupting the main task.

Do not add another model client or hardcode a model into the module. Use native workspace/specialist configuration. Configuration affects whether autonomous discovery is requested; explicit operator/main-agent fuzzing calls remain available under the existing semantics.

## 7. Test ownership and acceptance

**Module repository:** replace ordinary private-framework imports with `@capri/sdk/testing`, explicit core-tool/family stubs, synthetic captures, fake process execution and temporary databases/files. Test the module itself here; no other real modules. UI tests use a fake component context and the shared SDK renderer. Native identities in unit tests are explicitly fake, not evidence of live routing.

Because the SDK is not publicly published to npm, obtain a compatible packed SDK artifact for development/CI. CI may build it from an exact framework revision in a separate checkout, then install the tarball for tests without committing machine-specific dependency paths. Running the module unit suite must no longer require `CAPRI_FRAMEWORK_ROOT` or private framework imports.

**Framework repository:** test SDK exports/types/packaging and generic component navigation with synthetic modules only. Do not import this real fuzzing package into framework CI.

**Explicit installed acceptance, Windows and Linux:**

1. Use disposable workspaces: module enabled, module disabled, and a child with a complete local override. Check tool providers, role/skill visibility and page activation against applied state.
2. Seed local fixture traffic through the configured provider. Read through core's proxy abstraction, store observations and agent-labelled candidates, then generate/read an exact wordlist revision. Qualify Caido and Burp sequentially, never enabled together; distinguish fixture tests from actual provider checks.
3. Run two independent ffuf jobs against a local fixture. Cancel one; the other must complete. Repeat with concurrent wordlist exports/reads and result views. Confirm direct ffuf traffic, explicit inputs, output collision rejection and no duplicate scan launch.
4. Compare baseline/enhanced results, including matches beyond the first page, cursor invalidation, malformed/incomplete output and preserved raw evidence.
5. Verify original native recipient attribution, core-generated notifications and operator/agent inbox separation. Check a native specialist task and, separately, an explicitly ongoing assignment with hold/stop; do not infer those results from mocks.
6. Exercise the page in the actual host-backed panel on both hosts, without fullscreen navigation. Cover reopen, workspace switches, disablement, applied-package changes, 320/390px layout and keyboard interaction. No accidental scan on mount or form edit.
7. Run the same module operations through CLI/core without the dashboard. Completed wordlists and core scan evidence remain available under their documented owners.

## 8. Delivery order

| Phase | Deliverable | Completion check |
|---|---|---|
| 1 — SDK seam and baseline | Supported shared result-reader export/types; baseline module contracts recorded; generic navigation contract defined. | Packed SDK works independently; core tests remain synthetic. |
| 2 — Runtime migration | SDK imports, small entry point, preserved overrides, workers/lifecycles and coherent package versions. | Existing module behavior passes SDK-based tests without private framework imports. |
| 3 — Dashboard data APIs | Batch readers, vocabulary query support, wordlist task listing and explicit container-file previews. | CLI and agent interfaces work independently of UI; storage/observer compatibility passes. |
| 4 — Page and navigation | Generic component shortcuts plus the module's five views. | Scoped UI tests pass; no core reference to the real fuzzing module is required for navigation. |
| 5 — Apply and qualify | Publish compatible SDK/framework changes, then release module source and explicitly apply in disposable workspaces on both hosts. | Installed/CLI/native/UI evidence records actual revisions and any remaining operator actions. |

Edit and commit the module in **its own repository** first. Framework SDK/navigation changes belong in the framework repository with their own tests. Update both hosts from those repositories; never edit applied snapshots. Do not globally enable the redeveloped module or change existing workspace activation as a side effect. Dependency/UI rebuilds use the existing installer, with no Docker-engine access added to module containers.

Completion means the tested SDK-based module, its dedicated workspace page and CLI behavior work on both installations—not merely that a bundle compiled or an asynchronous request was accepted.
