'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Providers,parseGeminiModels}=require('../app/ai/providers.cjs');
const {launchPlan}=require('../app/ai/provider-tools.cjs');
const listing='Fetching available models...\ngemini-4-argon-medium\tGemini 4 Argon (Medium)\ngemini-4-argon-high\tGemini 4 Argon (High)\ngemini-4-argon-low\tGemini 4 Argon (Low)\nclaude-opus-5-5-high\tClaude Opus 5.5 (High)\ngpt-oss-120b-medium\tGPT-OSS 120B\n';
test('Antigravity account listing keeps every model it offers (Claude and GPT-OSS too), once each',()=>{
 const models=parseGeminiModels('\x1b[32m'+listing+'\x1b[0m'+listing);
 assert.equal(models.length,5);assert.deepEqual(models.map(([id])=>id),['gemini-4-argon-medium','gemini-4-argon-high','gemini-4-argon-low','claude-opus-5-5-high','gpt-oss-120b-medium']);
 assert.deepEqual(parseGeminiModels('--model bad\tFake\ngemini-evil;cmd\tFake'),[]);
});
test('Argon model ids survive launch planning instead of falling back to Flash',()=>{
 for(const effort of ['low','medium','high']){
  const id='gemini-4-argon-'+effort;
  const plan=launchPlan({provider:'gemini',model:id,mode:'chat',access:'ask',workspace:os.tmpdir()});
  assert.equal(plan.cli[plan.cli.indexOf('--model')+1],id);
 }
 // v0.9.6: an unknown or malformed name falls back to Otomatik (no --model) instead of failing
 for(const bad of ['--yolo','gemini evil','-x']){const plan=launchPlan({provider:'gemini',model:bad,mode:'chat',access:'ask',workspace:os.tmpdir()});assert.ok(!plan.cli.includes('--model'),bad);}
});
test('Model refresh uses account CLI, caches exact ids, survives failures and remains login-gated',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'charles-gemini-models-'));
 const script=path.join(dir,'models.cjs'),output=path.join(dir,'output.txt');
 fs.writeFileSync(output,listing);
 fs.writeFileSync(script,"if(process.argv[3]!=='models')process.exit(3);process.stdout.write(require('node:fs').readFileSync(process.argv[2]));");
 try{
  const p=new Providers(dir,dir);p.spec=()=>({exe:process.execPath,args:[script,output]});
  await p.refreshGeminiModels();assert.equal(p.geminiModels.length,5);assert.equal(p.models().length,0);
  p.auth.gemini=true;
  const listed=p.models();
  // v0.9.6: the three efforts are one model; the effort panel picks the level.
  const argon=listed.filter(m=>m.id.startsWith('gemini:gemini-4-argon-'));
  assert.equal(argon.length,1);
  assert.equal(argon[0].name,'Antigravity · Gemini 4 Argon');
  assert.equal(argon[0].id,'gemini:gemini-4-argon-medium');
  assert.deepEqual(argon[0].efforts.map(e=>e.value),['low','medium','high']);
  assert.deepEqual(argon[0].efforts.map(e=>e.id),['gemini:gemini-4-argon-low','gemini:gemini-4-argon-medium','gemini:gemini-4-argon-high']);
  assert.deepEqual(argon[0].efforts.map(e=>e.label),['Low','Medium','High']);
  // v0.9.6: a model's rows stay together - the account models sit inside the Gemini family.
  const ids=p.allModels().map(([id])=>id);
  const gemini=ids.filter(id=>id.startsWith('gemini:'));
  assert.deepEqual(ids.slice(ids.indexOf(gemini[0]),ids.indexOf(gemini[0])+gemini.length),gemini);
  assert.ok(ids.indexOf('gemini:gemini-4-argon-medium')<ids.findIndex(id=>id.startsWith('claude:')));
  const restored=new Providers(dir,dir);assert.deepEqual(restored.geminiModels,p.geminiModels);
  fs.writeFileSync(output,'Network unavailable');await p.refreshGeminiModels();assert.equal(p.geminiModels.length,5);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
