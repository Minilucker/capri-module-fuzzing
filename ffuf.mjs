import { safePath } from '@capri/module-utils';
import { resultFields, resultFilters } from './results-contract.mjs';

export function setupFfuf({ overrideTool, fuzzing, worker, workspace, config, exportInfo, readWordlist }) {
  overrideTool('fuzz_run', {
    description: 'Run direct ffuf discovery using explicit file paths or a named generated wordlist revision. Supply normal ffuf options; optionally supply wordlist instead of options.wordlists. Configured defaults fill omitted options, explicit values win, and output is recorded by core.',
    extraArguments: {
      wordlist: { type: 'object', required: ['name', 'revision'], additionalProperties: false, properties: {
        name: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,63}$', description: 'Completed wordlist name from fuzzing_list or fuzzing_generate.' },
        revision: { type: 'integer', minimum: 1, description: 'Exact completed revision; no implicit latest revision is chosen.' },
        keyword: { type: 'string', minLength: 1, maxLength: 200, pattern: '^[^:\\r\\n\\u0000]+$', description: 'Optional native ffuf marker for this wordlist; omission uses ffuf\'s FUZZ marker.' }
      }, description: 'Use one immutable module-generated wordlist. Cannot be combined with options.wordlists or options.input_command.' }
    }
  }, async (args, operation, base) => {
    const { wordlist, ...input } = args;
    const defaults = { ...config.ffufDefaults }; delete defaults.wordlists;
    const options = { ...defaults, ...input.options };
    if (!input.options?.wordlists?.length && !wordlist && !input.options?.input_command && !input.options?.version && !input.options?.search) {
      throw new Error('Supply options.wordlists, an explicit input command, or a named wordlist revision');
    }
    if (wordlist) {
      if (input.options?.wordlists !== undefined || input.options?.input_command !== undefined || options.input_command !== undefined) throw new Error('Choose a named wordlist OR explicit wordlists/input_command');
      const info = exportInfo(wordlist.name, wordlist.revision);
      await readWordlist({ path: info.path, sha256: info.sha256, offset: 0, limit: 1 }, operation.signal);
      const file = safePath(workspace.directory, info.path);
      options.wordlists = [file + (wordlist.keyword ? ':' + wordlist.keyword : '')];
    }
    return base.execute({ ...input, options }, operation);
  });

  overrideTool('fuzz_result', {
    description: 'Read saved ffuf results with optional filters, selected fields or compact, summary and table views. Supply a run ID; filtering happens before pagination. Calls without view options retain the core result format and never rerun the target.',
    extraArguments: {
      view: { enum: ['standard', 'compact', 'summary', 'table'], description: 'standard keeps full rows; compact selects common fields; summary aggregates all matches without rows; table formats the returned page. Defaults to standard.' },
      fields: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: resultFields }, description: 'Ordered fields for standard, compact or table rows. Summary has fixed aggregate fields.' },
      filters: resultFilters,
      cursor: { type: 'string', minLength: 1, maxLength: 2000, description: 'Opaque next_cursor from an enhanced result page. Keep run ID, filters, view, fields and limit unchanged; do not also supply offset.' }
    }
  }, async (args, operation, base) => {
    const { view, fields, filters, cursor, ...input } = args;
    if (view === undefined && fields === undefined && filters === undefined && cursor === undefined) return base.execute(input, operation);
    if (cursor !== undefined && input.offset !== undefined) throw new Error('Choose cursor OR offset');
    const { job, reference, file, format, cache } = fuzzing.resolve(input.id);
    if (!reference) return base.execute(input, operation);
    const result = await worker('ffuf_results', { id: input.id, file, format, cache, offset: input.offset, limit: input.limit, view, fields, filters, cursor }, operation.signal);
    return { id: input.id, state: job.state, kind: 'ffuf', artifact: reference, output_format: job.output_format || format, artifact_format: format, artifacts: job.artifacts || [reference], ...result };
  });
}
