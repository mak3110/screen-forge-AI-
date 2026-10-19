/**
 * Audio Pre-Processing Utilities (Web Audio API)
 * Downsamples recorded WebM audio to 16kHz Mono 16-bit PCM WAV in the browser.
 * Reduces transmission size by >90% to avoid HTTP payload limits.
 */

export async function extract16kHzMonoWav(webmBlob: Blob): Promise<Blob> {
  const arrayBuffer = await webmBlob.arrayBuffer();
  
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const tempAudioCtx = new AudioCtx();
  
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await tempAudioCtx.decodeAudioData(arrayBuffer);
  } finally {
    tempAudioCtx.close().catch(() => {});
  }

  // Target sample rate for Whisper / speech models: 16000 Hz, 1 channel (mono)
  const targetSampleRate = 16000;
  const duration = audioBuffer.duration;
  const targetLength = Math.ceil(duration * targetSampleRate);

  // Render downsampled mono buffer using OfflineAudioContext
  const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  const channelData = renderedBuffer.getChannelData(0);

  // Encode to standard 16-bit PCM WAV
  return encodeWav(channelData, targetSampleRate);
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, "RIFF");
  // File length minus RIFF header
  view.setUint32(4, 36 + samples.length * 2, true);
  // RIFF type
  writeString(view, 8, "WAVE");
  // Format chunk identifier
  writeString(view, 12, "fmt ");
  // Format chunk length
  view.setUint32(16, 16, true);
  // Sample format (raw PCM = 1)
  view.setUint16(20, 1, true);
  // Channel count (1 = mono)
  view.setUint16(22, 1, true);
  // Sample rate
  view.setUint32(24, sampleRate, true);
  // Byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // Block align (channels * bytes per sample)
  view.setUint16(32, 2, true);
  // Bits per sample
  view.setUint16(34, 16, true);
  // Data chunk identifier
  writeString(view, 36, "data");
  // Data chunk length
  view.setUint32(40, samples.length * 2, true);

  // Write 16-bit PCM audio samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
