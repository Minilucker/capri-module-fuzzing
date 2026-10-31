import {field,strings} from '@capri/sdk';
const described=(schema,description)=>({...schema,description});
export const filters={kind:{enum:['all','observed','inferred'],description:'Select observed words, inferred candidates or both; omission includes both.'},batch_ids:described(strings,'Optionally select vocabulary from these existing batch IDs; omission or an empty list includes all batches.'),origin:described(field,'Optional exact stored origin, such as application_response or agent_inference.')};
