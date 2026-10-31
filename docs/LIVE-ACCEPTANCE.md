# Live SDK acceptance — 31 October 2026

The operator explicitly enabled fuzzing in development on both hosts. The applied module now inherits into development's existing subworkspaces; pentest and bug-bounty were not changed. This is a live qualification supplement to [SDK-ACCEPTANCE.md](SDK-ACCEPTANCE.md), not another framework-owned module test.

## Current results

| Check | Windows host | Ubuntu host |
| --- | --- | --- |
| Fresh native tools, registered role and workspace skill | Passed after direct Full access turn | Passed |
| Main/specialist model | GPT-5.6 Sol | GPT-5.6 Sol |
| Real Caido capture through common proxy tools | Passed | Passed |
| Observed provenance → agent inference → immutable wordlist | Passed | Passed |
| Two independent direct ffuf runs and saved filtered/summary views | Passed | Passed |
| Native specialist primary / main secondary notices | Passed | Passed |
| Main continues independent proxied health request | Passed | Passed |
| Additional on-demand saved-result reviewer | Passed | Not separately run |
| Hold, fresh traffic while held, same-identity resume, stop | Passed | Passed |
| Earlier wordlist revision unchanged after new revision | Passed | Passed |
| Burp forwarding and synthetic target request | Passed | Passed (existing Burp listener 8081) |
| Burp capture normalization | Small captured response passed | Blocked by upstream invalid, truncated history JSON |
| Native Burp specialist workflow | Passed for the small-record path | Blocked by capture read |

No production runtime code was changed to obtain these results. The module's autonomous-discovery setting remains false; the active runs were explicitly assigned by the operator/main agent. Hold/stop are native cooperation behavior, not a new scheduler or an automatic monitoring guarantee.

## Real identities and evidence

- Windows main: `01a1937f-a538-7183-b4f4-f6ae05c49fc7`; ongoing specialist: `01a1938d-69b8-7c23-b9ca-ff82d601fbbb`; reviewer: `01a1938e-e783-76b3-bcd4-c3a6a0d5169e`.
- Windows one-off Burp specialist: `01a19397-71ee-7ae0-842d-314bfddc5a7a`; its real capture → inferred wordlist → direct run `a9dd0fce-6e57-4318-bdd4-1359982ab418` confirmed nine fixture endpoints, with correct native recipients and no active run after stop.
- Linux main: `01a180a9-7cfb-72a0-9cfd-d273cc45fbf1`; ongoing specialist: `01a1938e-5cff-72b3-95bb-bfb179aad33b`.
- Each workspace retains JSON evidence under `.capri/core/acceptance/fuzzing-live-20261031/`: native Phase A/B/C records, exact run and revision IDs, native recipients, original proxy settings, provider-capture checks, and independent fixture-log hold verification. These local artifacts are not committed because upstream history can contain unrelated sensitive traffic.
- Windows Phase B root scan confirmed five fixture endpoints; Linux's smaller candidate set confirmed one. Resume confirmed new archive/cobalt endpoints on both hosts. Candidate choices differ between model runs; the acceptance does not require identical inferred words.
- The 30–33 second measured hold interval contained only the one operator-seeded request on each host. The resumed specialists retained their original native IDs and stopped after the assigned batch. This demonstrates the tested interval, not perpetual monitoring reliability.
- Linux chat dispatch uses the existing test-only Desktop IPC driver over SSH. It is not a module/runtime dependency and does not start a second daemon or interact with the unrelated CLI session.
- Final independent reads from each existing container daemon confirmed GPT-5.6 Sol, danger-full-access/never and idle state for all tested main/specialist threads. The Windows new-chat restriction was resolved by the operator selecting Full access and submitting directly; no Desktop code or policy bypass was used.

## Cleanup

Both original Caido projects and the original `cooperation-20261030` bindings were restored through the UI/CLI. Provider parameters returned to their original values. The separate Caido test projects remain as evidence. The existing Linux Burp instance and its 8081 listener were not reconfigured or closed; Capri's temporary forwarding to it was stopped. The Windows Burp process started for this test was stopped. Test specialists are idle with no active test runs.

## Burp blocker

The Linux MCP returned seven history entries, each cut to approximately 5,000 serialized characters and ending in `... (truncated)`. Every entry was invalid JSON. Capri correctly returned `UPSTREAM_FORMAT`; it did not invent missing data, ignore malformed entries, replay requests to reconstruct bodies, or silently substitute a different provider.

The matching upstream defect is [PortSwigger issue 114](https://github.com/PortSwigger/mcp-server/issues/114). [PR 115](https://github.com/PortSwigger/mcp-server/pull/115) merged a structural JSON fix on 12 August 2026, but still retains the 5,000-character content budget. The [latest published GitHub release inspected](https://github.com/PortSwigger/mcp-server/releases), v1.3.0 dated 26 May, predates that change. A fixed build would address syntax, but full response-body capture remains a separate upstream limitation. No unrequested fork or source-built extension has been installed.

Changing to a clean history or reducing the page size would conceal this large-record failure, not fix it. The Windows small-record check is therefore recorded separately from the blocked Linux history check.

## Reproduction

Module-owned opt-in helpers:

```sh
node test/live-fixture.mjs EVIDENCE_DIRECTORY HOST_LAN_IP
node test/live-provider.mjs FRAMEWORK_DIRECTORY HOST_LAN_IP seed
node test/live-provider.mjs FRAMEWORK_DIRECTORY HOST_LAN_IP history
```

Use only an operator-owned local fixture. Helpers do not start models, switch providers, clear history or manufacture native caller metadata. Create/select Caido test projects through its UI and bind through Capri's existing operator CLI. Provider changes are sequential and original settings/bindings must be restored after testing. Native specialist prompts are dispatched separately through the actual Desktop.
