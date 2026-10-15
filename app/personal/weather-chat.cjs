// Answers simple weather questions locally for the saved city.
const { normalize } = require('../system/desktop.cjs');
async function weatherReply(prompt, city, weather) {
  const text = normalize(prompt)
    .replace(/[?.!,]+/g, '')
    .trim();
  if (
    !/^(?:charles\s+)?(?:(?:bugun|su an|simdi|burada|bulundugum yerde)\s+)?(?:hava(?: durumu)?(?:\s+(?:ne|nasil|nedir|kac derece|nasil olacak|nasil acaba))?|(?:sicaklik|hava sicakligi)\s+(?:ne|kac|kac derece)|kac derece)(?:\s+(?:soyle|soyler misin|bakar misin))?$/.test(
      text,
    )
  )
    return null;
  if (!city)
    return 'Hava durumunu söyleyebilmem için Ayarlar → Hava durumu şehrini seç bölümünden konumunu seç. 🌤️';
  try {
    const value = await weather.current(city);
    return `${value.text}\n\nSeçtiğin konumun güncel hava durumu.`;
  } catch {
    return `${city.name} için hava durumuna şu anda ulaşamıyorum. İnternet bağlantını kontrol edip biraz sonra tekrar sorabilirsin.`;
  }
}
module.exports = { weatherReply };
