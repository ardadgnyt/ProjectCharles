// v0.6.5: how every AI provider may ask the user a question inside Charles.
// The renderer (src/chat/ai-questions.ts) hides the block and shows a card with buttons;
// the user's answer arrives as the next message.
const ASK_FORMAT =
  ' Görevi iyi yapmak için kullanıcıdan bir karar ya da eksik bir bilgi gerekiyorsa (birden çok makul yol var, önemli bir ayrıntı belirsiz) tahmin edip yanlış iş yapma; yanıtının SONUNA şu biçimde soru ekle ve orada dur: <charles-soru>{"soru": "Kısa soru?", "secenekler": ["Seçenek 1", "Seçenek 2"]}</charles-soru> Kurallar: en fazla 3 soru (her biri ayrı blok); seçenekler kısa ve en fazla 5 tane; serbest yanıt gerekiyorsa "secenekler": [] yaz; birden fazla seçilebiliyorsa "coklu": true ekle. Blok dışındaki metinde soruyu tekrar etme. Basit ve açık isteklerde soru sorma, doğrudan yap.';
module.exports = { ASK_FORMAT };
