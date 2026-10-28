import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {frameworkImport} from './framework.mjs';
const {bundleModuleSource}=await frameworkImport('src/package-snapshot.mjs');
const bundled=bundleModuleSource(fileURLToPath(new URL('../',import.meta.url)),'ffuf.mjs');
const {directFfufInvocation}=await import('data:text/javascript;base64,'+bundled.toString('base64'));
import {ffufArguments,ffufOptionsSchema} from '../ffuf-options.mjs';

test('named ffuf options preserve repeated values, false booleans and direct environment',()=>{
  const options={config_file:'operator.toml',headers:['One: first','Two: second'],wordlists:['-'],follow_redirects:false,threads:3,rate:0};
  const env={HTTP_PROXY:'http://proxy',https_proxy:'http://proxy',aLl_PrOxY:'socks5://proxy',no_proxy:'localhost',PATH:'preserved'};
  const before=structuredClone(options),direct=directFfufInvocation(options,env,'/controlled/config');
  assert.deepEqual(direct.argv,['-x=','-replay-proxy=','-H=One: first','-H=Two: second','-r=false','-config=operator.toml','-rate=0','-t=3','-w=-']);assert.deepEqual(options,before);
  assert.deepEqual(direct.env,{PATH:'preserved',NO_PROXY:'*',no_proxy:'*',XDG_CONFIG_HOME:'/controlled/config'});assert.equal(env.HTTP_PROXY,'http://proxy');
});

test('ffuf schema has no raw/proxy option and option-looking strings stay values',()=>{
  for(const name of ['argv','extra_args','x','proxy','proxy_url','replay_proxy','replay-proxy']){
    assert.equal(ffufOptionsSchema.properties[name],undefined);assert.throws(()=>ffufArguments({[name]:'http://proxy'}),/additional properties/);
  }
  for(const options of [{threads:'5'},{follow_redirects:'false'},{headers:'One: value'},{input_mode:'invalid'},{wordlists:[null]},{data:'nul\0byte'}])assert.throws(()=>ffufArguments(options),/Invalid ffuf options/);
  assert.deepEqual(ffufArguments({headers:['-x','a: value -replay-proxy=http://unused'],data:'--x=http://unused',wordlists:['-','/path with spaces/words:ALT']}),['-H=-x','-H=a: value -replay-proxy=http://unused','-d=--x=http://unused','-w=-','-w=/path with spaces/words:ALT']);
});

test('ordered preflight/postflight steps retain request-variable association',()=>{
  assert.deepEqual(ffufArguments({preflight:[{request_file:'login.req',variables:['SESSION:session=(.*)','TOKEN:token:(.*)']},{request_file:'csrf.req',variables:['CSRF:(.*)']}],postflight:[{request_file:'cleanup.req',variables:['DONE:(.*)']}]}),[
    '-postflight=cleanup.req','-postflight-var=DONE:(.*)',
    '-preflight=login.req','-preflight-var=SESSION:session=(.*)','-preflight-var=TOKEN:token:(.*)',
    '-preflight=csrf.req','-preflight-var=CSRF:(.*)'
  ]);
});
