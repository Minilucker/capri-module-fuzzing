import Ajv from 'ajv';

// Public option catalogue for the pinned binary. No raw argv escape hatch.
// Native compatibility aliases use the same fields; proxy controls are internal.
const string={type:'string',maxLength:65536,pattern:'^[^\\u0000]*$'};
const list={type:'array',items:string,maxItems:1024};
const boolean={type:'boolean'},integer={type:'integer'};
const choice=(...values)=>({type:'string',enum:values});
const flights={type:'array',maxItems:100,items:{type:'object',required:['request_file'],additionalProperties:false,properties:{
  request_file:{...string,minLength:1,description:'Path of the raw HTTP request file.'},
  variables:{...list,description:'Ordered NAME:regex extractions from this step’s response.'}
}}};
const option=(flag,schema,description)=>({flag,schema,description});
export const ffufOptions={
  headers:option('H',list,'HTTP headers as repeated Name: Value strings.'),
  method:option('X',string,'HTTP method.'),
  cookies:option('b',list,'Cookie strings, one entry per native cookie argument.'),
  client_certificate:option('cc',string,'Client certificate path.'),
  client_key:option('ck',string,'Client private-key path.'),
  data:option('d',string,'Request body.'),
  http2:option('http2',boolean,'Enable HTTP/2.'),
  ignore_body:option('ignore-body',boolean,'Skip fetching response bodies.'),
  postflight:option('postflight',flights,'Ordered requests after each fuzzing request; each step owns its variable extractions.'),
  preflight:option('preflight',flights,'Ordered requests before fuzzing; each step owns its variable extractions.'),
  preflight_error:option('preflight-error',choice('abort','ignore'),'Preflight error handling.'),
  preflight_mode:option('preflight-mode',choice('per-request','per-thread'),'Preflight execution mode.'),
  follow_redirects:option('r',boolean,'Follow redirects.'),
  raw:option('raw',boolean,'Do not URI-encode the request.'),
  recursion:option('recursion',boolean,'Enable recursive discovery.'),
  recursion_depth:option('recursion-depth',integer,'Maximum recursion depth.'),
  recursion_strategy:option('recursion-strategy',choice('default','greedy'),'Recursion strategy.'),
  sni:option('sni',string,'TLS SNI hostname; no FUZZ substitution.'),
  timeout:option('timeout',integer,'HTTP timeout in seconds.'),
  url:option('u',string,'Target URL, including the fuzzing keyword.'),
  version:option('V',boolean,'Print the installed version and exit.'),
  auto_calibrate:option('ac',boolean,'Automatically calibrate filters.'),
  calibration_strings:option('acc',list,'Repeated custom calibration strings; implies calibration.'),
  calibration_per_host:option('ach',boolean,'Calibrate separately per host.'),
  calibration_keyword:option('ack',string,'Calibration keyword.'),
  calibration_strategies:option('acs',list,'Custom calibration strategies; native comma splitting applies.'),
  color:option('c',boolean,'Colorize output.'),
  config_file:option('config',string,'Explicit ffuf configuration file; network routing remains direct.'),
  json:option('json',boolean,'Print newline-delimited JSON on stdout.'),
  max_time:option('maxtime',integer,'Maximum seconds for the whole process; native zero means no limit.'),
  max_time_job:option('maxtime-job',integer,'Maximum seconds per native job.'),
  noninteractive:option('noninteractive',boolean,'Disable the interactive console.'),
  delay:option('p',string,'Delay or random delay range in seconds, e.g. 0.1 or 0.1-2.0.'),
  rate:option('rate',integer,'Requests per second; native zero means unlimited.'),
  silent:option('s',boolean,'Suppress additional output.'),
  stop_all_errors:option('sa',boolean,'Stop on all error conditions.'),
  scraper_file:option('scraperfile',string,'Custom scraper file path.'),
  scrapers:option('scrapers',string,'Active scraper groups.'),
  stop_errors:option('se',boolean,'Stop on spurious errors.'),
  search:option('search',string,'Look up a FFUFHASH in native history.'),
  stop_403:option('sf',boolean,'Stop when more than 95 percent of responses return 403.'),
  threads:option('t',integer,'Concurrent threads.'),
  verbose:option('v',boolean,'Include full URLs and redirects in results.'),
  match_status:option('mc',string,'Status codes/ranges or all.'),
  match_lines:option('ml',string,'Response line counts/ranges.'),
  match_mode:option('mmode',choice('and','or'),'Combine matchers with this operator.'),
  match_regex:option('mr',string,'Response regular expression.'),
  match_size:option('ms',string,'Response sizes/ranges.'),
  match_time:option('mt',string,'Time-to-first-byte comparison in milliseconds, e.g. >100.'),
  match_words:option('mw',string,'Response word counts/ranges.'),
  filter_status:option('fc',string,'Status codes/ranges to filter.'),
  filter_lines:option('fl',string,'Line counts/ranges to filter.'),
  filter_mode:option('fmode',choice('and','or'),'Combine filters with this operator.'),
  filter_regex:option('fr',string,'Regular expression to filter.'),
  filter_size:option('fs',string,'Response sizes/ranges to filter.'),
  filter_time:option('ft',string,'Time-to-first-byte comparison to filter.'),
  filter_words:option('fw',string,'Word counts/ranges to filter.'),
  dirsearch_compatibility:option('D',boolean,'DirSearch wordlist compatibility.'),
  extensions:option('e',string,'Comma-separated extensions.'),
  encoders:option('enc',list,'Keyword encoder specifications, e.g. FUZZ:urlencode b64encode.'),
  ignore_comments:option('ic',boolean,'Ignore wordlist comments.'),
  input_command:option('input-cmd',string,'Command producing inputs; native ffuf runs it inside the container.'),
  input_count:option('input-num',integer,'Number of command-generated inputs.'),
  input_shell:option('input-shell',string,'Shell used for input commands.'),
  mode:option('mode',choice('clusterbomb','pitchfork','sniper'),'Native multiple-wordlist operation mode.'),
  request_file:option('request',string,'Raw HTTP request file.'),
  request_protocol:option('request-proto',choice('http','https'),'Protocol for the raw request.'),
  wordlists:option('w',list,'Wordlist paths with optional :KEYWORD suffix; use - for stdin.'),
  audit_log:option('audit-log',string,'Audit-log file path.'),
  debug_log:option('debug-log',string,'Internal debug-log file path.'),
  output:option('o',string,'Results file path.'),
  output_directory:option('od',string,'Directory for matched results.'),
  output_format:option('of',choice('json','ejson','html','md','csv','ecsv','all'),'Result file format.'),
  skip_empty_output:option('or',boolean,'Do not create an empty results file.')
};
export const ffufOptionsSchema={type:'object',additionalProperties:false,properties:Object.fromEntries(Object.entries(ffufOptions).map(([key,o])=>[key,{...o.schema,description:`${o.description} Native -${o.flag}${o.schema===flights?` / -${o.flag}-var`:''}.`}]))};
const ajv=new Ajv({strict:false,allErrors:true}),validate=ajv.compile(ffufOptionsSchema);
export function ffufArguments(options={}) {
  if(!validate(options))throw new Error('Invalid ffuf options: '+ajv.errorsText(validate.errors));
  const argv=[];
  for(const [key,o]of Object.entries(ffufOptions)) {
    const value=options[key];if(value===undefined)continue;
    if(o.schema===flights) {
      for(const step of value){argv.push(`-${o.flag}=${step.request_file}`);for(const variable of step.variables || [])argv.push(`-${o.flag}-var=${variable}`);}
    } else for(const item of Array.isArray(value)?value:[value])argv.push(`-${o.flag}=${item}`);
  }
  return argv;
}
export const ffufNativeFlags=Object.values(ffufOptions).flatMap(o=>o.schema===flights?[o.flag,o.flag+'-var']:[o.flag]);
