// How every AI provider may ask the user a question inside Charles (v0.6.5).
// The renderer (src/chat/ai-questions.ts) hides the block and shows a card with buttons;
// the user's answer arrives as the next message.
//
// v0.7.0: Claude used the card in nearly every reply (even for "a"). The rule is now strict:
// questions are the exception, a reasonable assumption is the default, and small talk,
// greetings, unclear one-word messages and ordinary questions are answered in plain text.
const ASK_FORMAT =
  ' Soru kartı (yalnızca gerektiğinde): Varsayılan davranışın, makul bir varsayımla doğrudan yanıt vermek ya da işi yapmaktır. Selamlaşma, sohbet, bilgi sorusu, kısa veya anlamsız mesajlar (ör. tek harf) ve açık isteklerde ASLA soru kartı kullanma; gerekirse kısa, normal bir cümleyle sor. Soru kartını yalnızca yanlış bir tahmin ciddi emek veya zaman kaybettirecekse (ör. büyük bir dosya/proje işinde birden çok gerçekten farklı yol varsa) kullan. Kullanırsan yanıtının SONUNA şu biçimde ekle ve orada dur: <charles-soru>{"soru": "Kısa soru?", "secenekler": ["Seçenek 1", "Seçenek 2"]}</charles-soru> Kurallar: genelde tek soru, en fazla 3 (her biri ayrı blok); seçenekler kısa ve en fazla 4 tane; serbest yanıt gerekiyorsa "secenekler": [] yaz; birden fazla seçilebiliyorsa "coklu": true ekle. Blok dışındaki metinde soruyu tekrar etme.';
module.exports = { ASK_FORMAT };
