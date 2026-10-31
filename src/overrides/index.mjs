import { safePath } from '../io.mjs';
import { resultFields, resultFilters } from '../results-contract.mjs';

export function setupFfuf({ overrideTool, fuzzing, worker, workspace, config, exportInfo, readWordlist }) {
  overrideTool('fuzz_run', {
    description: 'Start direct ffuf using explicit paths or a generated wordlist revision. Supply normal options; optionally use wordlist instead of options.wordlists. Returns one run id including verification; follow with fuzz_status, fuzz_result or fuzz_cancel. Explicit options override defaults.',
    extraArguments: {
      wordlist: { type: 'object', required: ['name', 'revision'], additionalProperties: false, properties: {
        name: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,63}$', description: 'Completed wordlist name from fuzzing_list or fuzzing_generate.' },
        revision: { type: 'integer', minimum: 1, description: 'Exact completed revision; no implicit latest revision is chosen.' },
        keyword: { type: 'string', minLength: 1, maxLength: 200, pattern: '^[^:\\r\\n\\u0000]+$', description: 'Optional native ffuf marker for this wordlist; omission uses ffuf\'s FUZZ marker.' }
      }, description: 'Use one immutable module-generated wordlist. Cannot be combined with options.wordlists or options.input_command.' }
    }
  }, async (args, call, base) => {
    const { wordlist, ...input } = args;
    const defaults = { ...config.ffufDefaults }; delete defaults.wordlists;
    const options = { ...defaults, ...input.options };
    if (!input.options?.wordlists?.length && !wordlist && !input.options?.input_command && !input.options?.version && !input.options?.search) {
      throw new Error('Supply options.wordlists, an explicit input command, or a named wordlist revision');
    }
    if (wordlist) {
      if (input.options?.wordlists !== undefined || input.options?.input_command !== undefined || options.input_command !== undefined) throw new Error('Choose a named wordlist OR explicit wordlists/input_command');
      const info = exportInfo(wordlist.name, wordlist.revision);
      return fuzzing.start(call, async run => {
        await readWordlist({ path: info.path, sha256: info.sha256, offset: 0, limit: 1 }, run.signal);
        const file = safePath(workspace.directory, info.path);
        options.wordlists = [file + (wordlist.keyword ? ':' + wordlist.keyword : '')];
        return fuzzing.execute({ ...input, options }, run);
      });
    }
    return base.execute({ ...input, options }, call);
  });

  overrideTool('fuzz_result', {
    description: 'Prepare saved ffuf results with filters, selected fields or compact/summary/table views. Supply a run id; then poll with only view_id until ready. Filtering precedes pagination. No target requests are made; fuzz_cancel can cancel the view independently.',
    extraArguments: {
      view: { enum: ['standard', 'compact', 'summary', 'table'], description: 'standard keeps full rows; compact selects common fields; summary aggregates all matches without rows; table formats the returned page. Defaults to standard.' },
      fields: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: resultFields }, description: 'Ordered fields for standard, compact or table rows. Summary has fixed aggregate fields.' },
      filters: resultFilters,
      cursor: { type: 'string', minLength: 1, maxLength: 2000, description: 'Opaque next_cursor from an enhanced result page. Keep run ID, filters, view, fields and limit unchanged; do not also supply offset.' }
    }
  }, async (args, call, base) => {
    const { view, fields, filters, cursor, ...input } = args;
    if (input.view_id && [view,fields,filters,cursor].some(value=>value!==undefined)) throw new Error('Poll a view_id without new result query arguments');
    if (input.view_id || view === undefined && fields === undefined && filters === undefined && cursor === undefined) return base.execute(input, call);
    if (cursor !== undefined && input.offset !== undefined) throw new Error('Choose cursor OR offset');
    return fuzzing.result(args, call, async (query, work) => {
      const { job, reference, file, format, cache } = fuzzing.resolve(input.id);
      if (!reference) return fuzzing.read(input, work);
      const result = await worker('ffuf_results', { id: input.id, file, format, cache, offset: input.offset, limit: input.limit, view, fields, filters, cursor }, work.signal);
      return { id: input.id, state: job.state, kind: 'ffuf', artifact: reference, output_format: job.output_format || format, artifact_format: format, artifacts: job.artifacts || [reference], ...result };
    });
  });
}
