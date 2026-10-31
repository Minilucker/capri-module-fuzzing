import {parentPort,workerData} from 'node:worker_threads';
try {const {run}=await import(workerData.entry);parentPort.postMessage({value:await run(workerData.data)});}
catch(error){parentPort.postMessage({error:error.message});}
