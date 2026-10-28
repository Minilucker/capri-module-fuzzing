# Fuzzing module

Independent Capri module, API 1. Source: [Minilucker/capri-module-fuzzing](https://github.com/Minilucker/capri-module-fuzzing). Framework: [bsecure-fr/capri](https://github.com/bsecure-fr/capri).

This module extends core's `fuzz_run` and `fuzz_result` tools and adds target vocabulary, generated wordlists and an optional specialist. Core still owns the ffuf process, operation lifecycle, output reservation, raw artifacts and result index. Loading this module does not create another backend, scheduler or ffuf process.

## Tools and ownership

| Capability | Owner |
| --- | --- |
| `fuzz_run`, `fuzz_result`, `fuzz_options`, `fuzz_input` baseline | Core |
| Wordlist revision input and optional ffuf defaults in `fuzz_run` | This module's extension |
| Filtering, field selection, cursors and result views in `fuzz_result` | This module's extension |
| `fuzzing_add_observed`, `fuzzing_add_candidates`, `fuzzing_words`, `fuzzing_generate`, `fuzzing_list`, `fuzzing_read`, `fuzzing_read_file`, `fuzzing_settings` | This module |
| Proxy history capture, operations and notifications | Core |

Agent-supplied candidates remain distinct from observed words, with source references and explanations. Inference is performed by the agent; MCP tools store supplied words and generate immutable wordlist revisions. Passive proxy-history reads do not send target requests. Explicit ffuf runs use direct traffic and never proxy.

`fuzz_run` accepts core's explicit native options, including multiple wordlist markers. Alternatively, pass `wordlist: {name, revision, keyword?}` to use one completed generated revision. The module verifies its content hash before delegating the same operation to core. Configured `ffufDefaults` fill omitted options; explicit options win. A wordlist is never taken from defaults, and generated references never choose an implicit latest revision.

`fuzz_result` without extra arguments preserves core's result format. Add `filters`, `fields`, or `view` (`standard`, `compact`, `summary`, `table`) for enhanced reading. Filtering covers the complete indexed result set before pagination. Summary aggregates all matching rows; table formats only the requested page. Cursor reuse requires the same run, source artifact, filters, view, fields and page size. Reading results never reruns ffuf or changes its evidence. Unsupported output formats and incomplete results retain explicit diagnostics and raw artifact references. Core's existing 256 MiB JSON indexing limit still applies.

## Installation and activation

Keep this repository as a separate checkout. Place or import it under the intended workspace's `modules/fuzzing` directory; use `/workspaces/modules/fuzzing` for global inheritance. The manifest ID identifies the module. Apply the workspace configuration through Capri's existing module workflow. Editing or pulling the repository does not by itself publish a new applied configuration.

Version 0.4.0 requires Capri's tool override API, baseline fuzzing contract `1.x`, `context.fuzzing` helpers and the pure `@capri/fuzz-results` alias. Other helper imports use `@capri/module-api` and `@capri/module-utils`. Core bundles executable snapshots, resolves these aliases, and installs/deduplicates the declared ffuf dependency.

The `fuzzing` specialist starts on demand by default. Its role description advertises when to delegate; the optional `skills/fuzzing` skill explains the workflow when needed. No module guidance is injected globally. Existing explicit workspace agent/start preferences remain operator configuration. `activeDiscovery` is an autonomous-specialist preference, not a restriction on explicitly requested `fuzz_run` calls.

The old public `fuzzing_ffuf_*` names are retired. Use the canonical `fuzz_*` tools, and core's operation status/result/cancellation tools. Historical operation records and evidence are not renamed.

## Storage

Vocabulary and wordlist metadata belong to the module database. Generated files live under `<workspace>/.capri/modules/fuzzing.v1/wordlists/`; arbitrary and generated wordlist reads use the module's `cache/index.sqlite`. Its migration and upgrade-cleanup entries own the module schema and unfinished-export cleanup. Core's change observer produces notifications separately.

New raw ffuf outputs and their provider-independent index belong under `<workspace>/.capri/core/fuzzing/`. Core can read saved runs independently of this module being enabled. Module result views use the same pure core iterator and index, avoiding a second result cache. Runtime data is never written into this source repository.

## Tests

Install framework dependencies, then run `npm test` in this repository. The helper locates an enclosing Capri source checkout, or uses `CAPRI_FRAMEWORK_ROOT`. Tests bundle this module with public framework helpers and use synthetic captures, local temporary data and stubbed registration, operation and process interfaces. They do not create a core server, load another real module, run ffuf, or contact a target. Framework tests use synthetic module packages and do not import this repository.

The suite covers baseline delegation, explicit/default input rules, generated revision integrity, vocabulary/export storage, filtering before pagination, complete summaries, result rendering, cursor invalidation and raw-artifact preservation. [Manual deployment acceptance](test/MANUAL-ACCEPTANCE.md) is separate and must use the installed framework's current native identity and tool interfaces. Obsolete pre-0.4 scripts are retained as non-executable text in [the history archive](docs/archive/v0.3-manual-acceptance/README.md).
