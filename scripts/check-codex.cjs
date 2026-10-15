const path = require('node:path');
const { Agent } = require('../app/ai/agent.cjs');
const a = new Agent(path.resolve(__dirname, '..'));
(async () => {
  try {
    const account = await a.connect();
    console.log('Codex protokol bağlantısı: başarılı.');
    console.log(
      'ChatGPT girişi:',
      account.signedIn ? 'mevcut' : 'uygulamadaki ChatGPT ile giriş düğmesi gerekli',
    );
    console.log(
      'Model kataloğu:',
      (await a.models()).length,
      'kayıt. Katalog, hesap erişimi garantisi değildir.',
    );
    console.log('Model çağrısı veya proje dosyalarında değişiklik yapılmadı.');
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    a.stop();
  }
})();
