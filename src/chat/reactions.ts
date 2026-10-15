// Turns chat text into Slime reactions.
//   textReaction(userMessage)  – how Slime reacts to what the user writes
//   answerReaction(aiAnswer)   – how Slime reacts to the tone of Charles' own answer
export type Reaction =
  | 'love'
  | 'proud'
  | 'happy'
  | 'surprised'
  | 'yawn'
  | 'wink'
  | 'annoyed'
  | 'greet';

function plain(text: string) {
  return text.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function textReaction(text: string): Reaction | null {
  const s = plain(text);
  if (/(seni seviyorum|seviyorum seni|cok tatlisin|canimsin|tatlisin|❤|💕|😍|🥰)/.test(s))
    return 'love';
  if (
    /\b(aferin|harikasin|iyi is cikardin|seninle gurur duyuyorum|basardim|basardik|gectim|kazandim|kazandik|tebrikler)\b/.test(
      s,
    )
  )
    return 'proud';
  if (
    /\b(tesekkur|sag ol|sagol|mutluyum|cok sevindim|super|harika|mukemmel|muhtesem|efsane|cok iyi|bayildim)\b|😊|😄|🙂|👍/.test(
      s,
    )
  )
    return 'happy';
  if (
    /\b(inanilmaz|sasirdim|vay canina|vay be|ciddi misin|olamaz|hayret|yok artik)\b|😮|😲|🤯/.test(
      s,
    )
  )
    return 'surprised';
  if (
    /\b(uykum geldi|esniyorum|uykun mu geldi|yoruldum|cok yorgunum|uyuyacagim|iyi geceler)\b|🥱|😴/.test(
      s,
    )
  )
    return 'yawn';
  if (/\b(goz kirp|aramizda kalsin|sakaydi|saka saka)\b/.test(s) || /;[-]?\)|😉|😜/.test(s))
    return 'wink';
  if (
    /\b(huysuzlan|sana takiliyorum|sinir oldum|sinirlendim|of ya|berbat|cok kotu)\b|😠|😤|🙄/.test(
      s,
    )
  )
    return 'annoyed';
  if (/\b(merhaba|selam|gunaydin|iyi aksamlar|hey charles|naber|nasilsin)\b/.test(s))
    return 'greet';
  return null;
}

export function answerReaction(text: string): Reaction | null {
  const s = plain(text.slice(0, 1500));
  if (/\b(tebrikler|tebrik ederim|basardin|harika is|gurur)\b|🎉|🏆|🥳/.test(s)) return 'proud';
  if (/\b(maalesef|uzgunum|uzgunum ama|yapamiyorum|erisemiyorum)\b|😔|😕/.test(s)) return 'annoyed';
  if (/\b(vay|ilginc|sasirtici)\b|😮|🤯/.test(s)) return 'surprised';
  if (/😉|😜/.test(s)) return 'wink';
  if (/❤|💕|🥰/.test(s)) return 'love';
  if (/\b(iyi geceler|dinlen)\b|😴/.test(s)) return 'yawn';
  return null;
}

export function isRateLimit(message: string) {
  return /rate.?limit|usage.?limit|quota|too many requests|kullanim (?:siniri|limiti)|limit.{0,20}(?:dol|as)|429/i.test(
    message.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i'),
  );
}
