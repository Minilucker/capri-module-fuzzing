import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';
// Resolve public framework helpers from a checkout or explicit test dependency.
// Tests never start its core service or load another real module package.
function discover(){let dir=path.dirname(fileURLToPath(import.meta.url));while(true){if(existsSync(path.join(dir,'src/package-snapshot.mjs')))return dir;const parent=path.dirname(dir);if(parent===dir)throw Error('Set CAPRI_FRAMEWORK_ROOT to the Capri checkout');dir=parent;}}
export const frameworkRoot=process.env.CAPRI_FRAMEWORK_ROOT||discover();
export const frameworkImport=relative=>import(pathToFileURL(path.join(frameworkRoot,relative)).href);
