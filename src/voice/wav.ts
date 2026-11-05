/** Samples as a 16 kHz mono 16-bit WAV file. */
export function wavBytes(chunks: Float32Array[], length: number) {
  const data = new Uint8Array(44 + length * 2);
  const v = new DataView(data.buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, data.length - 8, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks)
    for (const sample of chunk) {
      const s = Math.max(-1, Math.min(1, sample));
      v.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
      offset += 2;
    }
  return data;
}
