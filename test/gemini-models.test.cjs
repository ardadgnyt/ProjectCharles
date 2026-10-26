'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Providers,parseGeminiModels}=require('../app/ai/providers.cjs');
const {launchPlan}=require('../app/ai/provider-tools.cjs');
const listing='Fetching available models...\ngemini-4-argon-medium\tGemini 4 Argon (Medium)\ngemini-4-argon-high\tGemini 4 Argon (High)\ngemini-4-argon-low\tGemini 4 Argon (Low)\nclaude-opus-5-5-high\tClaude Opus 5.5 (High)\ngpt-oss-120b-medium\tGPT-OSS 120B\n';
test('Gemini account listing includes every Argon effort without unrelated providers or duplicate rows',()=>{
 const models=parseGeminiModels('\x1b[32m'+listing+'\x1b[0m'+listing);
 assert.equal(models.length,3);assert.ok(models.every(([id])=>id.startsWith('gemini-4-argon-')));
 assert.deepEqual(parseGeminiModels('--model bad\tFake\ngemini-evil;cmd\tFake'),[]);
});
test('Argon model ids survive launch planning instead of falling back to Flash',()=>{
 for(const effort of ['low','medium','high']){
  const id='gemini-4-argon-'+effort;
  const plan=launchPlan({provider:'gemini',model:id,mode:'chat',access:'ask',workspace:os.tmpdir()});
  assert.equal(plan.cli[plan.cli.indexOf('--model')+1],id);
 }
 assert.throws(()=>launchPlan({provider:'gemini',model:'unknown',mode:'chat',access:'ask',workspace:os.tmpdir()}),/Geçersiz Gemini/);
});
test('Model refresh uses account CLI, caches exact ids, survives failures and remains login-gated',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'charles-gemini-models-'));
 const script=path.join(dir,'models.cjs'),output=path.join(dir,'output.txt');
 fs.writeFileSync(output,listing);
 fs.writeFileSync(script,"if(process.argv[3]!=='models')process.exit(3);process.stdout.write(require('node:fs').readFileSync(process.argv[2]));");
 try{
  const p=new Providers(dir,dir);p.spec=()=>({exe:process.execPath,args:[script,output]});
  await p.refreshGeminiModels();assert.equal(p.geminiModels.length,3);assert.equal(p.models().length,0);
  p.auth.gemini=true;assert.ok(p.models().some(m=>m.id==='gemini:gemini-4-argon-high'&&m.name==='Gemini · 4 Argon (High)'));
  const restored=new Providers(dir,dir);assert.deepEqual(restored.geminiModels,p.geminiModels);
  fs.writeFileSync(output,'Network unavailable');await p.refreshGeminiModels();assert.equal(p.geminiModels.length,3);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
