import { pickVoice } from "./voices";

export const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

/** Voices load asynchronously on most platforms: the first call can see an empty list. */
function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(synth.getVoices());
    synth.addEventListener("voiceschanged", done, { once: true });
    // Some browsers never fire the event; speak with the default voice after a moment.
    setTimeout(done, 500);
  });
}

export function speak(text: string, lang: string) {
  if (!speechSupported || !text) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  void voicesReady().then((voices) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    const voice = pickVoice(voices, lang);
    if (voice) utterance.voice = voice;
    utterance.rate = 0.95;
    synth.speak(utterance);
  });
}

/** Whether an installed voice speaks the language (false while voices are still loading), for audio-only questions. */
export function hasVoice(lang: string) {
  return speechSupported && pickVoice(window.speechSynthesis.getVoices(), lang) !== undefined;
}
