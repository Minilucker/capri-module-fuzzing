import path from 'node:path';
import {createHash} from 'node:crypto';
import {artifactPath,writeArtifact} from '@capri/sdk';
export const safePath=(root,file)=>artifactPath({directory:root},file);
export const within=(root,file)=>{const r=path.relative(root,file);return r!== '..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};
export const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export const atomic=(file,value)=>writeArtifact({directory:path.dirname(file)},path.basename(file),value);
