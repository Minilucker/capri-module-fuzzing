import {tool} from '@capri/sdk';
import {registerVocabulary} from './vocabulary.mjs';
import {registerWordlists} from './wordlists.mjs';
import {setupFfuf} from './overrides/index.mjs';
export function activate(api){
 api.register(tool('fuzzing_settings','Read applied autonomous-discovery preferences and ffuf defaults. Explicitly assigned runs remain available regardless of autonomous discovery.'),()=>{const defaults={...api.config.ffufDefaults};delete defaults.wordlists;return {autonomous_discovery:api.config.activeDiscovery===true,ffuf_defaults:defaults};},{attribution:'none'});
 registerVocabulary(api);const words=registerWordlists(api);setupFfuf({...api,...words});
}
