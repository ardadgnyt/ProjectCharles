const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { Providers } = require('../app/ai/providers.cjs');
test('Gemini models run through Antigravity and pass conversation through the supported NDJSON protocol', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-agy-'));
  try {
    const p = new Providers(path.resolve(__dirname, '..'), dir);
    assert.match(p.spec('gemini').exe, /antigravity[\\/]agy.exe$/);
    assert.equal(p.spec('gemini').args.length, 0);
    const config = JSON.parse(
      fs.readFileSync(path.join(dir, 'providers/gemini/.gemini/antigravity-cli/settings.json')),
    );
    assert.equal(config.useG1Credits, false);
    assert(config.permissions.deny.includes('command(*)'));
    const script = path.join(dir, 'cli.cjs');
    fs.writeFileSync(
      script,
      `let text='';process.stdin.on('data',s=>text+=s);process.stdin.on('end',()=>{const m=JSON.parse(text);if(m.event!=='user'||!m.message.content.includes('Merhaba'))process.exit(1);console.log(JSON.stringify({event:'init'}));console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',response:'Merhaba Charles'}}));});`,
    );
    p.spec = () => ({ exe: process.execPath, args: [script] });
    p.probe = async (id) => id === 'gemini';
    await p.refreshAuth(true);
    const messages = [];
    let done;
    const finished = new Promise((r) => (done = r));
    const agent = {
      busy: false,
      publish(_type, event) {
        messages.push(event);
        if (event.method === 'turn/completed') done();
      },
    };
    await p.send(agent, { model: 'gemini:auto', prompt: 'Merhaba' });
    await finished;
    assert.equal(
      messages.find((e) => e.method === 'item/completed').params.item.text,
      'Merhaba Charles',
    );
    assert.equal(agent.busy, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
