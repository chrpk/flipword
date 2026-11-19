# Technical feasibility of richer vocabulary games in flipword (browser PWA, as of 2026-11-19)

Scope: listening/dictation, speaking/pronunciation, cloze, picture, sentence-building, and AI-assisted content (example sentences, distractors, definitions, mnemonics) for flipword (React 19 SPA, Cloudflare Worker + D1 + R2, online-only, strict CSP, privacy-focused). Sources were gathered on 2026-11-19. Where a source is older or second-hand, that is noted inline. Some flipword code facts were checked directly in the repo (see "Repo observations" under the relevant questions).

Feasibility ratings used below: **High** = buildable now on all target browsers with no new infra; **Medium** = buildable but with per-platform gaps or new infra/cost; **Low** = unreliable on a major platform or needs heavy infra.

---

## 1. speechSynthesis (TTS): voice availability, quality and PWA quirks per platform

### Takeaway
speechSynthesis is everywhere, but which voices exist, and how good they are, depends on the OS and browser, not on the app. Expect gaps for less common target languages and bad voice metadata (language codes, names, `default`). A listening game is feasible if it detects at runtime that no voice exists for the target language and falls back, either by hiding the game or by using server TTS.

### Cited Findings
- **Android Chrome** returns an unfiltered list that includes languages whose voice packs are not installed. When a pack is missing it silently falls back to an English voice, and it does not report the user's preferred language through `default` — [Readium: SpeechSynthesis in browsers and OSes](https://readium.org/speech/docs/WebSpeech.html) (no page date; it cites voice counts "as of April 2024", so details may have changed).
- **Android Edge** returns an empty voice list, so the Web Speech API cannot be used there — [Readium](https://readium.org/speech/docs/WebSpeech.html) (≈2024 data).
- **Language-code formats vary.** `lang` is mostly BCP 47, but Android Chrome and Samsung use underscores (`en_us`), and Firefox on Android uses three-letter codes with a suffix (`eng-US-f000`). `default` is unreliable — [Readium](https://readium.org/speech/docs/WebSpeech.html).
- **iOS/iPadOS** use the same voices as macOS, and some preloaded voices appear twice. All iOS browsers use WebKit, so they behave like Safari — [Readium](https://readium.org/speech/docs/WebSpeech.html).
- **Safari:** downloadable voices do not appear in the list. Installing higher-quality variants can make preloaded voices, and sometimes whole languages, disappear. Every voice reports `default: true` — [Readium](https://readium.org/speech/docs/WebSpeech.html).
- **macOS** has voices in 45 languages in up to three quality tiers. Siri's highest-quality voices are not exposed to the Web Speech API — [Readium](https://readium.org/speech/docs/WebSpeech.html).
- **Chrome desktop** "Google" online voices: 19 voices across 15 languages, all online-only, and utterances longer than about 14 s hit a bug — [Readium](https://readium.org/speech/docs/WebSpeech.html).
- **Edge desktop** has 250+ ML "natural" voices across 75 languages, all online-only. On macOS only 18 appear until the API has produced speech once, then 250+ — [Readium](https://readium.org/speech/docs/WebSpeech.html).
- **Firefox** has no preloaded voices of its own (it uses OS voices). On macOS a reboot is needed before newly installed voices appear — [Readium](https://readium.org/speech/docs/WebSpeech.html).
- **Windows** natural voices need an up-to-date Windows 11 and a download, and appear in Edge but not in Chrome or Firefox — [Readium](https://readium.org/speech/docs/WebSpeech.html).
- **iOS 18 regression:** web apps that used to get good-quality voices from `getVoices()` reportedly saw only lower-quality voices after iOS 18 — [Apple Developer Forums thread 764438](https://developer.apple.com/forums/thread/764438) (2024; I did not confirm whether it is fixed in iOS 26).
- **Japanese voice missing from the list:** WebKit bug 250665 says `getVoices()` stopped listing Kyoko (ja-JP) from iOS 16.0.2, although Japanese text could still be spoken — [WebKit Bugzilla 250665](https://bugs.webkit.org/show_bug.cgi?id=250665) (2023; current status unverified).
- **Empty voice names:** on iOS 14, `getVoices()` returned voices with an empty `name` — [WebKit Bugzilla 216684](https://bugs.webkit.org/show_bug.cgi?id=216684) (old; likely fixed, shows how fragile names are).
- **Older Safari quirks:** Safari historically did not fire `voiceschanged`, and it blocks `speak()` unless it runs in a user gesture — summarized in search results from old Stack Overflow mirrors ([example](https://kaweah.freedombox.rocks/kiwix/content/stackoverflow.com_en_all_2023-11/questions/27779663/voiceschanged-event-not-fired-in-safari)). These are 2015–2023 era and may have changed.
- **Standalone PWA on iOS:** I found no source showing that `getVoices()` behaves differently in a home-screen PWA than in a Safari tab. The only PWA-specific precedent found concerns *recognition*: a 2021 article says the Speech Recognition API did not work in a standalone PWA on iOS 14.5 — [mobilexweb iOS 14.5](https://mobilexweb.com/ios-14.5/) (old).
- **Server-side TTS option:** Cloudflare Workers AI MeloTTS costs $0.0002 per audio minute (18.63 neurons/min). Aura-1 costs $0.015 per 1k characters, and Aura-2 (English and Spanish only) $0.030 per 1k characters — [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) (fetched 2026-11-19).

### Inferences
- **Repo observation (bug risk):** `src/lib/speech.ts` `pickVoice()` matches `v.lang.toLowerCase().split("-")[0]`. With Android's underscore codes (`en_us`) the base-language fallback never matches, and with Firefox Android's `eng-US-f000` the three-letter base never equals a two-letter `lang`. Normalize `_` to `-` and map ISO 639-2/3 to 639-1 before matching. The code also does not wait for the asynchronous voice list (`voiceschanged`), so the first `speak()` can run with no matched voice. This is from my general knowledge of Chrome's async loading and is not covered by the Readium page.
- **Listening/dictation game ("hear it, type or pick it"): Medium-High.** The game needs a reliable "a voice exists for the target language" check. Show the game only when `getVoices()` contains a voice whose normalized language matches. On Android Chrome a listed voice may still not be installed and may fall back to English, and the app cannot detect this. A "Did this sound wrong? Report / hide audio games" toggle mitigates it.
- **Fallbacks:** (a) hide audio games for the language pair; (b) generate audio once per word on the Worker with MeloTTS and cache it in R2. Cost is negligible: about $0.0002 per audio minute means a 2-second word costs well under $0.00001. The page would play a same-origin URL, which the existing CSP allows. MeloTTS language coverage was not checked (see Gaps).
- Utterances for single words and short sentences are far below Chrome's ~14 s bug, so that limit only matters for long example sentences.

### Gaps
- No 2026 primary source on iOS 26 / Safari 26 `speechSynthesis` voice-list behaviour or on standalone-PWA differences. This needs on-device testing.
- MeloTTS supported languages were not verified (I believe it covers only a handful: EN, ES, FR, ZH, JA, KO, but did not confirm). For arbitrary language pairs, server TTS coverage is a gap.
- No per-language voice-coverage matrix for 2026 was found.

---

## 2. SpeechRecognition support in 2026, on-device modes, privacy, accuracy and alternatives

### Takeaway
SpeechRecognition is still not Baseline. In 2026 it changed a lot: Chrome (since 139) and Edge (June 2026) support on-device recognition via `processLocally`, plus `available()`/`install()` for language packs. Firefox 160 desktop (Nov 2026) shipped on-device-only recognition in about 40 languages. Safari still exposes an older, Siri-dependent implementation and is reportedly not being actively developed, and Firefox Android has none. A speaking game is feasible as a progressive enhancement, not a core game. The server alternative (Workers AI Whisper) is cheap and works in every browser through MediaRecorder upload.

### Cited Findings
- **MDN:** SpeechRecognition is "not Baseline" and has limited availability. On some browsers it uses a server engine by default: "Your audio is sent to a web service for recognition processing, so recognition won't work offline unless you require on-device recognition using `processLocally`." MDN says users should be told their speech may leave the device — [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).
- **MDN API surface:** `processLocally` (must run on device); static `SpeechRecognition.available()` (are these languages available) and `SpeechRecognition.install()` (install on-device language packs); `phrases` (an array of `SpeechRecognitionPhrase` for contextual biasing); `maxAlternatives`; `grammars` is deprecated and has no effect — [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition); [MDN processLocally](https://developer.mozilla.org/docs/Web/API/SpeechRecognition/processLocally) (flagged experimental).
- **Chrome:** on-device Web Speech recognition has been supported since Chrome 139 (Aug 2025), per a Chrome AI dev-preview group post — [chrome-ai-dev-preview-discuss](https://groups.google.com/a/chromium.org/g/chrome-ai-dev-preview-discuss/c/Rlyc2uAsFCY). An Intent to Prototype (Jan 2026) added a `quality` hint (`'command' | 'dictation' | 'conversation'`) for on-device recognition, and the Intent to Ship thread (May 2026) says the spec PR has landed — [Intent to Prototype](https://groups.google.com/a/chromium.org/g/blink-dev/c/kR1Q5pcrk1Y), [Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/P8P-x7AnC6I), [TAG review #1189](https://tag-github-bot.w3.org/gh/w3ctag/design-reviews/1189) ("satisfied with concerns"). I did not verify whether `quality` is in Chrome stable.
- **Chrome rough edges:** on-device Web Speech was disabled on ChromeOS because the implementation was incomplete — [chrome-ai-dev-preview-discuss](https://groups.google.com/a/chromium.org/g/chrome-ai-dev-preview-discuss/c/Rlyc2uAsFCY). In Brave, `available()` returns "downloading" but nothing downloads and `install()` never resolves — [brave-browser #55414](https://github.com/brave/brave-browser/issues/55414). Electron fixed a renderer crash on `available()`/`install()` with `processLocally` in Aug 2026 — [electron PR 52955](https://releases.electronjs.org/pr/52955).
- **Edge:** Microsoft published a June 2026 post on new on-device speech recognition using `recognition.processLocally = true` — [Microsoft Edge blog](https://blogs.windows.com/msedgedev/?p=26205) (seen in search results only; not opened).
- **Firefox:** Mozilla posted an Intent to Prototype and Ship for strictly on-device `SpeechRecognition` (Sept 2026) — [mozilla dev-platform](https://groups.google.com/a/mozilla.org/g/dev-platform/c/6f4l8P9hO6o). Firefox 160 (reported Nov 9, 2026) shipped on-device speech-to-text on desktop for about 40 languages — [Phoronix: Firefox 160](https://phoronix.com/news/Firefox-160-Released), [TechEnclave](https://techenclave.com/news/items/firefox-160-adds-on-device-speech-recognition-on-desktop). Both sites returned 403 when fetched, so these details come from search snippets. Firefox for Android still lacks it, and community requests are open — [Mozilla Connect idea](https://connect.mozilla.org/t5/ideas/implement-speech-recognition-api-support-in-firefox-for-android/idi-p/94098).
- **Safari/iOS:** Safari's implementation uses Apple speech recognition and requires Siri to be enabled, citing the Safari 14.1 notes as quoted by a third-party guide — [technetexperts](https://www.technetexperts.com/ios-safari-speechrecognition-not-working/amp/) (secondary). A blog observes that Safari still seems to use the older SFSpeechRecognizer, not the iOS 26 on-device-only SpeechAnalyzer — [addpipe: SpeechAnalyzer](https://blog.addpipe.com/apple-speechanalyzer-api/) (observation, not an Apple statement). In the Chromium Intent to Ship thread, someone says Apple has no one actively working on the Web Speech API — [Intent to Ship thread](https://groups.google.com/a/chromium.org/g/blink-dev/c/P8P-x7AnC6I). Historic PWA quirk: recognition did not work in a standalone iOS PWA (iOS 14.5) — [mobilexweb](https://mobilexweb.com/ios-14.5/) (2021; status in iOS 26 unknown).
- **Server ASR alternative:** Workers AI `@cf/openai/whisper` and `whisper-large-v3-turbo` cost $0.0005 per audio minute (41.14 and 46.63 neurons/min). The free allocation is 10,000 neurons/day, then $0.011 per 1,000 neurons — [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).
- **In-browser Whisper (WASM/WebGPU)** is discussed in a June 2026 article on client-side ASR — [Fora Soft: client-side ASR in the browser](https://www.forasoft.com/learn/ai-for-video-engineering/articles-ai/client-side-asr-faster-whisper-wasm-browser) (search result only; not read, so no figures cited).

### Inferences
- **Speaking/pronunciation game: Medium (progressive enhancement), Low as a core feature.**
  - Chrome/Edge desktop and Android Chrome: feasible. Use `processLocally = true` when `available()` reports the language as available. Otherwise ask the user before using the cloud mode (audio goes to Google/Microsoft) or offer to `install()` the pack. Use `phrases` to bias toward the target word and `maxAlternatives` > 1 to accept near matches.
  - Firefox desktop 160+: feasible (on-device only), limited to its ~40 languages.
  - iOS/iPadOS (all browsers) and Firefox Android: treat as unsupported or unreliable. Fall back to the server ASR path below or to "self-check" mode, where the user records, plays back, compares with TTS and rates themselves.
- **Accuracy for single-word L2 utterances:** general ASR (dictation-tuned) is biased toward fluent native speech. A single isolated word from a learner is short and accented, gives the model little context, and is often mis-heard as a more common word. Using `phrases` biasing plus a lenient match (normalized string, edit distance ≤ 1 to 2, or any of N alternatives) is the practical mitigation. The game should frame results as "recognized / not recognized", not as a pronunciation score. This is my reasoning; I found no published accuracy figure for learners' single words.
- **Server path (Workers AI Whisper):** works everywhere MediaRecorder works. A 2 to 3 second clip costs about $0.000025 at $0.0005/min, so roughly $0.025 per 1,000 utterances if billed pro rata (billing granularity unverified). It keeps audio inside the app's own infrastructure (Cloudflare) rather than the browser vendor's, which can be stated plainly in the privacy policy. CSP is not affected because uploads go to `'self'`. Note that the current CSP has no `media-src`, so it falls back to `default-src 'self'`. Playing back the user's own recording from a `blob:` URL would need `media-src 'self' blob:`. Whisper also tends to "hallucinate" plausible words on very short or noisy clips (general knowledge, unverified here), so the lenient matching above still applies.
- **In-browser Whisper (transformers.js/WebGPU):** CSP already allows `'wasm-unsafe-eval'`, but `connect-src 'self'` means model weights (tens to hundreds of MB) would have to be self-hosted, for example on R2 behind the Worker. The first-run download is heavy for an online flashcard app on phones. Rating: Low to Medium. It is the most private option but the worst user experience on mobile.
- **Privacy:** under Chrome/Edge cloud mode, audio goes to the browser vendor, and in Safari to Apple (Siri dependency). Neither is visible to or controllable by flipword, and the CSP does not govern it. On-device (`processLocally`) or self-hosted (Workers AI) are the only choices that fit a privacy-focused positioning.

### Gaps
- No 2026 caniuse snapshot was retrieved, so exact Chrome/Edge/Safari/Opera version numbers for `processLocally`, `available()` and `install()` are unverified beyond "Chrome 139+".
- No primary WebKit or Apple statement on whether Safari 26's web SpeechRecognition runs on-device or on servers, or whether it works in standalone PWAs on iOS 26.
- Language coverage of Chrome's on-device packs not found.
- No latency figures for Workers AI Whisper or in-browser Whisper.

---

## 3. Cloze generation: blanking inflected forms, unspaced scripts, and missing examples

### Takeaway
Cloze from example sentences is very feasible for spaced, lightly inflected languages using exact match, then case/diacritic-insensitive match, then a prefix/stem heuristic. Intl.Segmenter (Baseline 2024) handles word boundaries for Japanese, Chinese and Thai, but heavily inflected languages and Japanese conjugation need a lemma-aware fallback. In practice that means asking the LLM to return the sentence with the target span already marked. When no example exists, generate one (see section 4) or skip the card.

### Cited Findings
- `Intl.Segmenter` is Baseline 2024 ("newly available"): Chrome 87, Edge 87, Firefox 125, Safari 14.1, iOS Safari 14.5, Firefox Android 125 — [MDN Intl.Segmenter](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter); [web.dev: Intl.Segmenter is now Baseline](https://web.dev/blog/intl-segmenter?hl=en).
- MDN notes that splitting on spaces fails for Japanese, Chinese, Thai, Lao, Khmer, Myanmar and similar languages. Its example segments `吾輩は猫である。名前はたぬき。` into `吾輩|は|猫|で|ある|。|名前|は|たぬき|。` — [MDN Intl.Segmenter](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter).
- Example Chinese and Thai segmentation: `["你好","世界"]` and `["สวัสดี","ครับ"]` — [Lingo.dev Intl.Segmenter guide](https://lingo.dev/en/javascript-i18n/intl-segmenter-api).
- No independent accuracy benchmark for Intl.Segmenter in CJK or Thai was found. Segmentation follows Unicode/ICU rules — [search summary of MDN/Lingo.dev](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter).

### Inferences
- **Recommended blanking algorithm (client-side, no dependencies):**
  1. Normalize the sentence and the card front with NFC, locale-aware lowercase, and optionally diacritics stripped for matching only.
  2. Segment with `new Intl.Segmenter(targetLang, {granularity: "word"})` and keep segments where `isWordLike` is true. This works for both spaced and unspaced scripts.
  3. Match in tiers: exact token sequence (multi-word fronts like "get up" or "der Hund"); token equality ignoring case and diacritics; for spaced languages, shared prefix ≥ max(4, 70% of the shorter word) or edit distance ≤ 2 for words of 5+ letters (catches "run/running", "Hund/Hunde", "parler/parlé"); for CJK, substring match on the front, since dictionary forms often appear verbatim (e.g. 猫) but conjugated verbs do not (食べる vs 食べた).
  4. If no tier matches, do not show a cloze for that sentence (avoids blanking the wrong word).
  5. Strip articles or particles from fronts like "der Hund" or "la maison" before matching, or blank the full phrase.
- Irregular forms (go/went, être/est), separable German verbs (anrufen → ruft … an), and Japanese conjugations defeat string heuristics. The robust solution is to store a marked sentence (`sentence` plus `[start,end)` span, or `{{c1::…}}` style markup) produced at generation time by an LLM that is told the target word. Then client-side matching is only needed for user-entered examples.
- **No example sentence:** the options are (a) skip the card from cloze rounds; (b) generate one with an LLM on the Worker, cache it in D1 per (word, language, meaning), and mark it "AI-generated" so the user can edit or reject it; (c) a "definition cloze" (show the back/definition and blank the front), which is just Spell it.
- **Cloze game feasibility: High** for user-provided examples in spaced languages with the heuristic. **Medium-High** overall with LLM-marked spans, which depend on the AI pipeline in section 4.
- **Sentence-building game (order the words):** uses the same Intl.Segmenter tokenization. For CJK and Thai, word segments become the tiles. Particles (は, の) as separate tiles may be too easy or too fiddly, so merging particles with the preceding token is a design choice. **Feasibility: High** wherever a sentence exists. Watch for sentences with several valid orders (common in free word-order languages like Russian, Polish or Latin); accept any order that equals the original sentence, or keep sentences short.
- **Picture game:** only for cards with photos (often empty, per brief). Same-origin R2 images already pass `img-src 'self'`. **Feasibility: High technically, Low coverage.** Fallback: hide the game when fewer than four photo cards exist in the deck. AI image generation is possible but out of scope and raises cost and quality concerns (not researched).

### Gaps
- No accuracy data for Intl.Segmenter on Japanese/Chinese/Thai versus dictionary-based segmenters (e.g. MeCab/kuromoji).
- I did not research JS lemmatizers or stemmers (e.g. Snowball ports) for bundle size and language coverage.

---

## 4. AI content via Cloudflare Workers AI (sentences, distractors, definitions, mnemonics): cost, latency, quality, caching, privacy

### Takeaway
Workers AI is a natural fit because it runs inside the existing Cloudflare account, needs no third-party script, and keeps CSP `connect-src 'self'`. It is cheap: a small or medium model costs roughly $0.07–$0.45 per 1,000 words of generated content, and the free tier covers on the order of a thousand words per day on an 8B-class model. The main risk is quality (wrong or unnatural sentences in low-resource languages, wrong sense for polysemous words), not cost. Generate once per word and language pair, cache in D1, and let users edit or reject.

### Cited Findings (Cloudflare Workers AI pricing page, fetched 2026-11-19)
- Free allocation is 10,000 neurons/day (resets 00:00 UTC). Paid is $0.011 per 1,000 neurons, and more than 10k/day requires Workers Paid — [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).
- Per-million-token prices (input / output):
  - Llama 3.1 8B fp8-fast: $0.045 / $0.384
  - Llama 3.2 3B: $0.051 / $0.335
  - Qwen3 30B A3B fp8: $0.051 / $0.335
  - Gemma 4 26B A4B: $0.100 / $0.300
  - GPT-OSS 20B: $0.200 / $0.300
  - GPT-OSS 120B: $0.350 / $0.750
  - Llama 4 Scout 17B: $0.270 / $0.850
  - Llama 3.3 70B fp8-fast: $0.293 / $2.253
  - Mistral Small 3.1 24B: $0.351 / $0.555

  Source: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).
- Embeddings: `bge-m3` (multilingual) costs $0.012 per M input tokens, and `bge-base-en-v1.5` $0.067 per M — [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).
- A third-party tracker says the pricing page changed tier structure several times in 2026 — [CostBench price history](https://costbench.com/software/llm-api-providers/cloudflare-workers-ai/price-history/) (secondary). Treat the figures above as a 2026-11-19 snapshot.
- The EDM 2025 paper notes that AI-generated distractors may struggle to produce orthographic (spelling-similar) options — [EDM 2025 poster/demo paper 279](https://educationaldatamining.org/edm2025/proceedings/2025.EDM.poster-demo-papers.279/2025.EDM.poster-demo-papers.279.pdf).

### Inferences
- **Cost per 1,000 words** (my arithmetic). Assumes about 300 input tokens (instructions plus word, translation and language pair) and about 150 output tokens (2 example sentences with marked span, 3 distractors, a short definition) per word:
  - Llama 3.1 8B fp8-fast: about $0.00007/word, **≈ $0.07 per 1k words**, about 6.5 neurons/word, so the free 10k neurons/day covers about 1,500 words/day.
  - Gemma 4 26B A4B: **≈ $0.08 per 1k words**.
  - GPT-OSS 120B: **≈ $0.22 per 1k words**.
  - Llama 3.3 70B: **≈ $0.43 per 1k words**.
  - Embedding every card front with bge-m3 is negligible: about 10 tokens per word gives ≈ $0.0001 per 1k words.
- **Caching:** key on (normalized front, back, target lang, native lang, model version). Store in D1 as a shared cache table. Words recur across users and decks, so the cache hit rate should be high and cost falls further. Store per-card overrides separately, so a user's edits never leak to the shared cache.
- **Latency:** not measured in any source I found. Generate lazily but ahead of time, for example in a background Worker or queue when a card is created, or on first game load for a batch of 20 cards. That way games never wait on the LLM mid-round.
- **Quality controls:** request structured JSON. Validate that the target word or a form of it appears in the sentence at the returned span. Reject sentences longer than N tokens. Ask for CEFR-appropriate vocabulary. Show an "AI" badge and let the user regenerate, edit or delete. Bigger models are noticeably safer for low-resource languages and for polysemy (the card's back disambiguates the sense, so always include it in the prompt).
- **Privacy:** Workers AI runs on Cloudflare, which already hosts the app, so card text never goes to a new third party. This is easy to disclose. Card content (words and translations) is low-sensitivity, but user-written example sentences could contain personal data. Only send front, back and language codes, and make AI generation opt-in per deck or user. Calling external LLM APIs (OpenAI/Anthropic/Google) would also work through the Worker, since CSP is unaffected, but adds a new sub-processor to the privacy policy.
- **Mnemonics:** technically trivial, but quality is the most subjective, and mnemonics in the native language need a model that is good at that native language. Make them low-priority, opt-in and user-editable.
- **AI content feasibility: High technically, Medium for quality.** Fallbacks: user-written examples; skip cloze or sentence games for cards without examples; deck-based distractors (section 5).

### Gaps
- No latency benchmarks for Workers AI models.
- No published quality evaluation of these specific models for example-sentence generation across language pairs.
- Workers AI terms on data retention or training were not fetched. Check the Cloudflare AI terms before making privacy claims.

---

## 5. Distractor quality: choosing hard multiple-choice distractors from the same deck

### Takeaway
Research on vocabulary multiple choice shows that distractors which are semantically related or orthographically similar to the answer make items harder and more discriminating. Distractor word difficulty (frequency) was the strongest single factor in one study, with effects that vary by learner level. Within a deck, combine: same part-of-speech or same "shape" (length, script, article), small edit distance on the front, and embedding similarity. Scale difficulty with the card's FSRS stability.

### Cited Findings
- Ludewig, Schwerter & McElvany (2023), *Journal of Psychoeducational Assessment* 41(7), 711–731, N = 924 German 4th graders, synonym-based vocabulary test. Options semantically related or orthographically similar to the answer made items harder and more discriminating. Distractors less synonymous with the target reduced discrimination. "The plausibility of distractors has a major influence on the psychometric characteristics of MC items." — [TU Dortmund repository](https://eldorado.tu-dortmund.de/items/2f2f24a7-464f-48d5-908b-d9e7ea2a97a9) (abstract only).
- Susanti et al. (2017), *Research and Practice in Technology Enhanced Learning*. In machine-generated English vocabulary items, distractor word difficulty had the greatest impact on item difficulty, more than passage difficulty or answer–distractor semantic similarity, and the effect varied with test-taker proficiency — [Springer, RPTEL 2017](https://link.springer.com/content/pdf/10.1186/s41039-017-0065-5.pdf) (abstract-level).
- Susanti et al. (2018) generated TOEFL-style distractors using word-difficulty (frequency) similarity, spelling similarity, PMI co-occurrence with the target, and word2vec similarity — [Springer, RPTEL 2018](https://link.springer.com/10.1186/s41039-018-0082-z).
- EDM 2025: multiple choice is criticized for emphasizing recognition over active recall. The paper focuses on orthographically related distractors for retrieval practice and notes that AI may struggle to produce orthographic distractors — [EDM 2025 paper 279](https://educationaldatamining.org/edm2025/proceedings/2025.EDM.poster-demo-papers.279/2025.EDM.poster-demo-papers.279.pdf).

### Inferences
- **Practical deck-local recipe** (no AI needed):
  - Filter candidates to the same "shape": same script, similar length (±40%), same leading article or particle pattern, and same answer side.
  - Score each as w1 × orthographic similarity (normalized Levenshtein or Jaro-Winkler on the answer text) + w2 × semantic similarity (cosine of bge-m3 embeddings cached per card) + w3 × "often confused" (the user's own past wrong picks from the game answer log).
  - Pick 1 hard, 1 medium and 1 random distractor, so items are hard but not a trick.
- **Adaptive difficulty:** for new or low-stability cards use easier (random) distractors. For mature cards use orthographic and semantic neighbours. This matches the finding that effects vary with proficiency.
- **Pitfalls:** true synonyms or alternative correct translations make an item unfair. Exclude candidates whose back or front equals the answer after normalization, and exclude very high embedding similarity (≈ duplicates). Small decks (< 8 cards) should borrow from a shared frequency list or from LLM-generated distractors.
- Part-of-speech is not stored on cards. It could be inferred cheaply by the LLM pass in section 4 and cached.
- The existing logged per-word game answers are a strong, free signal for "confusable pairs".

### Gaps
- Findings come from abstracts. Effect sizes, and whether harder distractors improve *learning* (not just test difficulty), were not verified. The test-psychometrics literature is about measurement, not retention.

---

## 6. Feeding game answers into FSRS correctly

### Takeaway
I found no official FSRS or ts-fsrs guidance on treating game or quiz answers as reviews. FSRS models a single memory per card from the ratings it is given, and its parameters assume a consistent review format. Community practice and vendor write-ups suggest: only recall-format answers (typed spelling, cloze typing, possibly speaking) should be candidate reviews, mapped to Again/Hard/Good. Recognition formats (MC, true/false, match) should stay as logged signals and should not reschedule.

### Cited Findings
- FSRS ratings: Again (1), Hard (2, "remembered the card with serious difficulty"), Good (3, "remembered the card after a hesitation"), Easy (4) — [py-fsrs on PyPI](https://pypi.org/project/fsrs/).
- The FSRS4Anki tutorial notes that reviews done before and after enabling FSRS both count (about history, not external practice). Its advice that long-overdue reviews do not skew parameters "as long as you answer honestly" applies to reviews done in Anki — [fsrs4anki tutorial (mirror)](https://github.hscsec.cn/open-spaced-repetition/fsrs4anki/blob/main/docs/tutorial.md); [FSRS4Anki README](https://github.com/user1823/fsrs4anki/blob/main/README.md).
- An Anki forum thread raises whether FSRS's effectiveness suffers if you often meet items outside Anki. The search did not surface a definitive answer — [Anki forums FSRS thread p.18](https://forums.ankiweb.net/t/how-to-use-the-next-generation-spaced-repetition-algorithm-fsrs-on-anki/25415?page=18).
- A vendor blog maps interaction signals to ratings: Hard for spelling with hints or hesitation, Good for a correct answer that took more than 5 s. It also notes ratings for spelling tend to come out harder than for recognition with the same parameters — [ByuTech: FSRS-5.0 vs traditional SR](https://byutech.cn/en/blog/fsrs-vs-traditional-spaced-repetition) (single vendor, not authoritative).
- Expert explainer on FSRS for implementers — [domenic.me/fsrs](https://domenic.me/fsrs/) (not opened in this session).

### Inferences
- **Recommended policy for flipword:**
  1. Keep the current default: games do not change the schedule.
  2. Optional "games count as reviews" setting, applied only to recall formats: Spell it, typed cloze, typed dictation, and maybe speaking with on-device or Whisper ASR. Apply it only when the card is due or overdue, not when it is early. Early reviews compress intervals, and inflating review counts from repeated game plays would distort FSRS stability. Map wrong to Again; correct with hint or after a retry to Hard; correct to Good; never Easy from a game. Log each one as a normal review with a `source: "game:<type>"` tag so parameter optimization can exclude them later.
  3. Recognition formats (Quiz MC, True/False, Match, Unscramble, picture choice): never write FSRS reviews. Use them as signals only: confusable pairs for distractors, "leech" detection, or a hint to surface a card sooner, such as adding a failed MC card to today's study queue without altering its memory state.
  4. One FSRS update per card per day from games at most. Multiple same-day answers are not independent recall events.
- Rationale: FSRS parameters are fitted on the review log as if every entry were the same task. Mixing easy recognition successes would bias retrievability estimates upward. This is my inference from the model's design, not a quoted FSRS-author position.

### Gaps
- No primary statement from open-spaced-repetition maintainers (GitHub discussions or ts-fsrs docs) on external or game reviews was retrieved within the tool budget. Worth checking ts-fsrs docs and open-spaced-repetition discussions directly, e.g. on "same-day reviews" and "review in different formats".

---

## 7. Mobile input: accented characters, accent bars, CJK IMEs

### Takeaway
I did not research this in depth (tool budget). Typed games (Spell it, typed cloze, dictation) already exist. The main technical issues are well-known platform behaviours, given below as unsourced inferences for the writer to verify or present cautiously.

### Cited Findings
- None retrieved in this session.

### Inferences (unverified, from general knowledge)
- iOS and Android keyboards provide accented letters by long-pressing the base letter, but discoverability is poor. An on-screen accent bar with the target language's special characters (é è ê ë ç ñ ß ä ö ü å ø œ etc., derived from the characters present in the deck's fronts) is cheap to build. It should insert at the caret using `setRangeText` on the input.
- Lenient grading options: accept answers that match after NFD and stripping combining marks, but mark them "almost — watch the accent", so missing accents do not count as fully correct.
- CJK and other IME input: listen for `compositionstart`/`compositionend` and do not grade on `input` events while `isComposing` is true, or a partially composed string gets graded. Set `lang`/`inputmode` and `autocapitalize="off" autocorrect="off" spellcheck="false"` on answer inputs. For Japanese, accept kana as well as kanji answers if the card stores a reading (it currently does not).
- Typed games in CJK on phones are slow. Tile-based games (Unscramble, sentence building, MC) are friendlier for those targets.

### Gaps
- No sources fetched on mobile accent input, `inputmode`, or IME composition-event behaviour on iOS Safari and Android Chrome in 2026. This needs either a follow-up search (MDN `CompositionEvent`, `isComposing`) or device testing.

---

## Summary feasibility matrix (inferences drawn from the sections above)

| Game / feature | What it needs | Feasibility (2026) | Main fallback |
|---|---|---|---|
| Listening: hear word, then pick or type | speechSynthesis voice for target lang | Medium-High (voice gaps for rarer languages; Android may silently use an English voice) | Hide per language; Worker-generated TTS (MeloTTS, limited languages) cached in R2 |
| Dictation of example sentence | TTS + example sentence | Medium | Use word-level dictation only |
| Speaking / pronunciation | SpeechRecognition (Chrome/Edge 139+ on-device, Firefox 160 desktop); none/legacy on iOS, none on Firefox Android | Medium as optional, Low as core | Workers AI Whisper ($0.0005/min) via MediaRecorder; self-rated record-and-compare |
| Cloze from example | Example + span matching (Intl.Segmenter + heuristics) | High (user examples) / Medium-High (with AI) | Skip card; AI-generate sentence with marked span |
| Sentence building | Sentence + Intl.Segmenter tokens | High where sentences exist | AI-generated short sentences |
| Picture game | Card photos in R2 | High technically, low coverage | Show only when 4+ photo cards |
| AI example sentences / definitions / distractors / mnemonics | Workers AI LLM + D1 cache | High technically, Medium quality | Deck-local distractors; user-written content |
| Harder MC distractors | Edit distance + bge-m3 embeddings + answer log | High | Random same-deck distractors |
| Games feed FSRS | Policy | High (it's a design choice) | Keep games as signals only |

Repo-specific notes for the writer:
- **CSP** (`public/_headers`) is `connect-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'`, and has no `media-src` (falls back to `default-src 'self'`). All AI and ASR must go through the Worker, which is compatible. Self-hosted WASM models are allowed if their weights are served same-origin. Playing back `blob:` recordings needs `media-src 'self' blob:`.
- **Voice matching:** `src/lib/speech.ts` voice matching does not handle Android `en_us` or Firefox Android `eng-US-f000` language codes, and does not wait for `voiceschanged`.
