import test from 'node:test';import assert from 'node:assert/strict';import {ffufOptionsSchema} from '../ffuf-options.mjs';
test('ffuf schema excludes proxy arguments',()=>{assert.equal(JSON.stringify(ffufOptionsSchema).includes('replay_proxy'),false);assert.equal(Object.hasOwn(ffufOptionsSchema.properties,'proxy'),false);});
