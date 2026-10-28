import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
// Integration tests consume the separately checked-out framework, never its modules.
export const frameworkRoot=process.env.CAPRI_FRAMEWORK_ROOT||path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
export const frameworkImport=relative=>import(pathToFileURL(path.join(frameworkRoot,relative)).href);
