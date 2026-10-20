const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {APP_ID,launcher,iconResource,registerShortcuts}=require('../app/core/windows-identity.cjs');
const root=path.resolve(__dirname,'..');
test('taskbar uses an immutable Slime resource and recovers from a corrupt saved icon',()=>{
 const user=fs.mkdtempSync(path.join(os.tmpdir(),'charles-icon083-'));
 const a=iconResource(user,root);assert.ok(path.isAbsolute(a));assert.match(a,/slime-[a-f0-9]{24}\.ico$/);
 assert.deepEqual(fs.readFileSync(a),fs.readFileSync(path.join(root,'public/charles.ico')));
 const stamp=fs.statSync(a).mtimeMs;assert.equal(iconResource(user,root),a);assert.equal(fs.statSync(a).mtimeMs,stamp);
 fs.writeFileSync(path.join(user,'charles.ico'),'broken');assert.equal(iconResource(user,root),a);
 const changed=Buffer.concat([fs.readFileSync(a),Buffer.from('changed')]);fs.writeFileSync(path.join(user,'charles.ico'),changed);
 const b=iconResource(user,root);assert.notEqual(a,b);assert.deepEqual(fs.readFileSync(a),fs.readFileSync(path.join(root,'public/charles.ico')));
});
test('Shell shortcuts share the window identity and repair only the current installation',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'charles-shortcut083-'));
 const desktop=path.join(dir,'Desktop');fs.mkdirSync(desktop);
 const links=new Map();let writes=0;
 const shell={readShortcutLink(p){if(!links.has(p))throw Error('missing');return links.get(p);},writeShortcutLink(p,op,v){fs.writeFileSync(p,'test');links.set(p,{...v});writes++;return true;}};
 const exe=path.join(root,'node_modules/electron/dist/electron.exe');
 const old=path.join(desktop,'ProjectCharles v0.8.2 Beta.lnk');shell.writeShortcutLink(old,'create',{target:exe,args:'"'+root+'"',icon:exe});
 const other=path.join(desktop,'Other Charles.lnk');shell.writeShortcutLink(other,'create',{target:'C:\\Other\\electron.exe',args:'"C:\\Other"',icon:'other'});
 const app={getPath:k=>k==='desktop'?desktop:dir};
 const canonical=registerShortcuts({app,shell,root,icon:path.join(root,'public/charles.ico'),executable:exe});
 assert.equal(links.get(canonical).appUserModelId,APP_ID);assert.equal(links.get(old).appUserModelId,APP_ID);
 assert.equal(links.get(old).target,path.join(root,'Charles.exe'));assert.equal(links.get(old).args,'');
 assert.equal(links.get(other).icon,'other');const count=writes;
 registerShortcuts({app,shell,root,icon:path.join(root,'public/charles.ico'),executable:exe});assert.equal(writes,count);
});
test('source-only launch falls back to Electron; releases contain a branded PE launcher',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'charles-launch083-'));
 assert.deepEqual(launcher(dir,'electron.exe'),{target:'electron.exe',args:'"'+dir+'"'});
 const bytes=fs.readFileSync(path.join(root,'Charles.exe'));assert.equal(bytes.subarray(0,2).toString(),'MZ');
 const pe=bytes.readUInt32LE(0x3c);assert.equal(bytes.subarray(pe,pe+4).toString(),'PE\0\0');
 const pkg=require('../scripts/release-pack.cjs').pack({outDir:dir});
 const entries=require('fflate').unzipSync(fs.readFileSync(pkg.zipPath));assert.deepEqual(Buffer.from(entries['Charles.exe']),bytes);
});
