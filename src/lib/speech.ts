export const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

function pickVoice(lang: string) {
  const voices = window.speechSynthesis.getVoices();
  const base = lang.toLowerCase().split("-")[0];
  return (
    voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().split("-")[0] === base)
  );
}

export function speak(text: string, lang: string) {
  if (!speechSupported || !text) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  const voice = pickVoice(lang);
  if (voice) utterance.voice = voice;
  utterance.rate = 0.95;
  synth.speak(utterance);
}
