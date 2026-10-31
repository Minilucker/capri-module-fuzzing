# Capri fuzzing module

Version **0.7.0**, using **@capri/sdk ^0.1.1**, module API 2 and core fuzzing contract 2.x. This is an independent module repository. Core continues to own ffuf execution, run/result-view lifecycles, saved scan evidence and notifications.

## Workspace dashboard

An applied workspace gets a collapsible **Fuzzing** sidebar family with two pages:

- **Runs:** all retained workspace runs with pagination; the recorded command and working directory; every input marker and wordlist. Each run has independent result filters, summaries and tables. Wordlist links open the exact generated revision or recorded path. Filters and selection survive page navigation within the current panel, scoped to workspace and applied module version. Settings are in an expandable section here.
- **Wordlists:** a searchable, paginated metadata snapshot separating generated revisions, other workspace files, internal libraries and external libraries/recorded inputs. Missing historical files remain visible. Selecting a wordlist can prefill a new run without starting it. Generation, vocabulary/provenance, tasks and explicit-file preview remain in expandable sections here.

Generated revisions retain their recorded hashes. Ordinary files are not historical content snapshots: previews show their current contents. The catalog scans .txt, .lst, .list, .dic and .wordlist files, plus generated or recorded run inputs regardless of extension. Child workspaces, runtime caches, module sources and directory symlinks are excluded from implicit traversal. Every catalog has an independent cancellable worker; pagination does not rescan files.

The page is workspace-scoped. Browsing, filtering, switching tabs or closing it never starts or cancels a scan. It uses the shared SDK UI and existing core APIs; it has no server of its own. Installation/build or plugin refresh may be required to load a new component bundle. Disabled workspaces do not receive the tools, specialist, skill or page.

## Tools and ownership

| Interface | Purpose |
|---|---|
| `fuzz_run` extension | Explicit native ffuf inputs or one named revision with hash verification; omitted ffuf options can inherit defaults. Core still starts exactly one run. |
| `fuzz_result` extension | Filter before pagination, select fields, read compact/summary/table views, and continue using an opaque cursor. No target requests. |
| `fuzzing_add_observed` | Save terms extracted by an agent from core proxy capture evidence. |
| `fuzzing_add_candidates` | Save agent-inferred terms with source batches and explanation. MCP performs no inference. |
| `fuzzing_words`, `fuzzing_batches`, `fuzzing_batch` | Search vocabulary, list provenance summaries, and read an exact batch. |
| `fuzzing_generate`, `fuzzing_export_result`, `fuzzing_export_status`, `fuzzing_export_cancel` | Start/follow/cancel immutable wordlist exports. |
| `fuzzing_list`, `fuzzing_read`, `fuzzing_read_file`, `fuzzing_read_result`, `fuzzing_read_cancel` | List completed revisions and asynchronously read exact revisions or explicit container files. |
| `fuzzing_wordlist_tasks` | List workspace export/read history and original attribution. |
| `fuzzing_catalog`, `fuzzing_catalog_result`, `fuzzing_catalog_cancel` | Snapshot and browse wordlist metadata, with origin/search filters. |
| `fuzzing_run_inputs` | Read the recorded command and exact wordlist identities for one run. |
| `fuzzing_settings` | Read applied discovery preferences and ffuf defaults. |

Core's `fuzz_status`, `fuzz_list`, `fuzz_cancel`, `fuzz_options` and `fuzz_input` retain their baseline semantics. Every run/view/read/export has its own lifecycle and cancellation signal. There is no module-wide queue or concurrency cap. Core supplies per-invocation native identity and observes the compatible business schema for notifications.

## Data and configuration

Module data stays under `<workspace>/.capri/modules/fuzzing.v1/`. Generated files use `wordlists/<name>/r000001.txt` plus a metadata sidecar. Lineage `fuzzing.v1`, schema `1.1.0`, and both existing migrations are unchanged. Core scan artifacts remain under core's fuzzing directory. Preview paths are container paths; host paths are not translated.

`activeDiscovery` defaults to false. It advertises whether autonomous discovery is requested; explicit operator/main-agent requests remain available. `ffufDefaults` supplies omitted options only. A wordlist is never silently selected from defaults. Native multi-marker inputs remain `options.wordlists`; one named revision can optionally provide its marker.

The shared result reader is the supported, worker-only `@capri/sdk/fuzzing` export. It currently indexes standard ffuf JSON up to 256 MiB. Unsupported, missing or incomplete output returns an explicit diagnostic, preserving the raw artifact.

### Shared wordlist libraries

The module setting `wordlistLibraries` adds container directories, for example:

```json
[{"path":"/opt/lists","kind":"external","label":"Team lists"}]
```

Kind is internal or external. Existing /usr/share/wordlists and /usr/share/seclists directories are internal libraries by default; the module does not download/install them. Configure through the module settings or CLI. After updating component code, apply the module and rebuild the optional dashboard with `node src/pt.mjs dashboard-enable` from the Capri checkout, then reopen the panel.

## Specialist and skill

`agents/fuzzing.toml` declares the manually started `fuzzing` specialist. Its skill is available to every agent in an enabled workspace. The main agent can delegate a one-off task or ongoing work until stopped/held or an explicit end condition is met. Native workspace configuration selects the model. There is no second model client or mandatory scheduler.

## Development and verification

Install the packed SDK supplied by a compatible Capri checkout, for example `npm install --save-dev /path/to/capri-sdk-0.1.1.tgz`, then `npm test`. Do not commit machine-specific SDK paths. Unit tests use only the public SDK testing harness, explicit core-family stubs and temporary data. They do not import private framework code, run ffuf or contact targets.

Additional explicit integrations:

- `CAPRI_FRAMEWORK=<checkout> node test/dashboard-browser.mjs`: actual module and shared host UI, with synthetic core operations; requires Chrome and the declared development dependencies.
- Inside the built core image, `CAPRI_FRAMEWORK=/opt/prototype FUZZING_MODULE=<module-directory> node <module-directory>/test/installed.mjs`: disposable enabled/disabled/child-override workspaces, actual snapshot loading, CLI management transport, storage reapply, notifications with synthetic native identities, and real ffuf against a loopback fixture.
- In the optional dashboard image, use the same variables with `test/bundle.mjs` to verify production component compilation. Core does not need dashboard code. These explicit integrations intentionally exercise the installed framework and are not framework unit tests.

[Implementation plan](docs/SDK-REDEVELOPMENT.md) and [acceptance record](docs/SDK-ACCEPTANCE.md) describe the migration, verified behavior and remaining live checks. Edit this repository first, then apply through Capri's existing loader. Never edit deployed snapshots.
