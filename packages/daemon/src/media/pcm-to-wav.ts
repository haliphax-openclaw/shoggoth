/**
 * Wrap raw PCM audio data with a WAV (RIFF) header.
 *
 * Parses sample rate, channels, and bit depth from the MIME type string
 * (e.g. `audio/L16;codec=pcm;rate=24000`). Defaults: 24000 Hz, 1 channel, 16-bit.
 */

interface PcmParams {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

/** Extract PCM parameters from an `audio/L16` MIME type string. */
export function parsePcmMimeParams(mimeType: string): PcmParams {
  const params: PcmParams = {
    sampleRate: 24000,
    channels: 1,
    bitsPerSample: 16,
  };

  // Parse semicolon-delimited params: audio/L16;rate=24000;channels=1
  const parts = mimeType.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim().toLowerCase();
    const val = trimmed.slice(eq + 1).trim();
    if (key === "rate") {
      const n = Number(val);
      if (Number.isFinite(n) && n > 0) params.sampleRate = n;
    } else if (key === "channels") {
      const n = Number(val);
      if (Number.isFinite(n) && n > 0) params.channels = n;
    } else if (key === "bits" || key === "bitspersample") {
      const n = Number(val);
      if (Number.isFinite(n) && n > 0) params.bitsPerSample = n;
    }
  }

  // L16 in the base type implies 16-bit
  const base = parts[0].trim().toLowerCase();
  if (base === "audio/l16") {
    params.bitsPerSample = 16;
  }

  return params;
}

/** Returns true if the MIME type indicates raw PCM audio. */
export function isRawPcmMime(mimeType: string): boolean {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  return base === "audio/l16" || base === "audio/l8";
}

/** Wrap raw PCM bytes in a WAV container. */
export function wrapPcmAsWav(pcmData: Buffer, params: PcmParams): Buffer {
  const { sampleRate, channels, bitsPerSample } = params;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcmData.byteLength;

  // 44-byte WAV header
  const header = Buffer.alloc(44);
  // RIFF chunk descriptor
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4); // ChunkSize
  header.write("WAVE", 8);
  // fmt sub-chunk
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (PCM = 16)
  header.writeUInt16LE(1, 20); // AudioFormat (PCM = 1)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  // data sub-chunk
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}
