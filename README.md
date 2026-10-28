# Fuzzing module

Independent module repository for the Capri framework, API 1. The manifest is `module.json`.

Source: [Minilucker/capri-module-fuzzing](https://github.com/Minilucker/capri-module-fuzzing). Framework: [bsecure-fr/capri](https://github.com/bsecure-fr/capri).

This repository owns the continuous fuzzing agent, vocabulary and wordlist MCP tools, direct ffuf wrapper, option schema, database migration, asynchronous processing workers, file indexes, unfinished-export cleanup and ffuf unit tests. The agent extracts and infers vocabulary from bounded proxy-history reads; MCP tools persist words and write wordlist revisions. Active fuzzing remains explicitly requested and never uses the proxy.

Core provides `proxy.traffic.read`, asynchronous jobs, database lifecycle and notification observation/delivery. The module does not create its own notification service or backend. Its manifest declares ffuf; the framework owns dependency installation and deduplication.

Clone this repository at `pentest-prototype/modules/fuzzing`, or import it into a workspace with the framework module-import CLI. Helper imports use the framework bundler aliases `@capri/module-api` and `@capri/module-utils`; `ajv` and `smol-toml` resolve from the framework installation. The loader prepares executable snapshots, so source does not depend on its relative location. For standalone unit tests, use the catalog checkout layout, run `npm ci` in the framework, then `npm test` here. The tests use the framework bundler. Run the framework suite for storage, tools, proxy, agents and notification integration coverage.

Enable `fuzzing` through the existing workspace configuration and apply workflow. Cloning/pulling does not activate it. See the framework's `MODULES.md` for arguments, defaults, inheritance and the operation contract.

Wordlists are written under `<workspace>/.capri/modules/fuzzing.v1/wordlists/`. Runtime data is not stored in this source repository.

`fuzzing_read_file` reads arbitrary workspace wordlist files; `fuzzing_read` reads a completed named revision. Both use the module-owned `cache/index.sqlite`. Neither tool exists in a workspace where fuzzing is disabled. The manifest's worker entries are bundled and run by core's generic worker executor. Its upgrade cleanup entry owns the export-reservation schema; core only dispatches it. Renaming the catalog does not rewrite historical operation records or move old evidence directories.

## Module-owned tests

Run `npm test` in this repository. Unit tests cover ffuf options; integration tests cover exports, results, storage cleanup and proxy workflows against synthetic inputs. Integration checks use the enclosing Capri checkout, or `CAPRI_FRAMEWORK_ROOT`. Framework CI never runs this suite. The `live-` and `native-` scripts in `test/` require explicit opt-in and their documented test environment.
