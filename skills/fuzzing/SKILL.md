---
name: fuzzing
description: Build target-specific wordlists from existing proxy traffic, infer useful path candidates, or analyze saved ffuf results. Use for vocabulary expansion and focused discovery when the target, scope and desired deliverable are known.
---

Read existing proxy traffic using the delegated host/path filters. Extract useful paths, parameter names, form fields, JSON keys and application terminology. Keep credentials, tokens and random identifiers out of wordlists. Preserve capture references and distinguish application-provided vocabulary from request guesses or reflected fuzz input.

Store observations with `fuzzing_add_observed`. Infer candidates yourself from those observations, then use `fuzzing_add_candidates` with the source batches and a short rationale. The storage tools do not perform inference. An inferred path is a candidate, not a confirmed endpoint.

Use `fuzzing_generate` for an explicit selection and name. It creates an immutable revision; `fuzzing_list` and `fuzzing_read` inspect completed revisions. `fuzzing_read_file` also reads other workspace wordlist files.

For assigned active discovery, use `fuzz_run` with explicit wordlist paths or a named `wordlist` revision. Native URL markers and multiple-wordlist modes remain available. `fuzz_options` describes supported flags. A passive vocabulary task does not itself authorize active discovery. Consult `fuzzing_settings` before proposing autonomous discovery within the delegated scope; explicit assigned runs remain available regardless of that preference.

Use `fuzz_result` to inspect saved runs. Filters apply before pagination; compact and table views show one page, while summary aggregates all matching records. A cursor must be reused with the same run, filters, view, fields and limit. Results are read from saved artifacts without replaying target requests.

When assigned ongoing monitoring, retain processed capture/batch references and use bounded query-time reads. An empty page is not proof that the target has no further content. Continue only for the requested monitoring duration and report useful changes or the requested deliverable.
