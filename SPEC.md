# flipword — product spec

Flashcard app for learning vocabulary in one language pair. Feature set is modelled on what
people rely on in Anki (scheduling quality, import) and Quizlet (simplicity, fast card entry).

## Users & auth

- Sign in with Google or Facebook (Better Auth, sessions in D1).
- Local development has an email/password "dev login" behind `DEV_LOGIN=true`; it is never enabled in production.
- Account deletion removes all of the user's decks, cards and history.
- **Download my data** (Settings → Account) returns everything stored about the user as one JSON file: profile,
  settings, decks with their words, review and game history, achievements, token names and reports made. Photos are
  listed by key.
- **Privacy policy** (`/privacy`) and **Terms of service** (`/terms`) are public pages, linked from the landing page
  footer, the login page and Settings. They show the operator and contact address from the `OPERATOR_NAME` /
  `CONTACT_EMAIL` vars. `/privacy#deletion` explains how to delete your data (used as Facebook's deletion instructions
  URL).

## Settings

| Setting | Default | Notes |
|---|---|---|
| I speak (native language) | `en` | Used for the back side's speech voice |
| I'm learning (target language) | `es` | Used for the front side's speech voice |
| New cards per day | 20 | Anki default |
| Maximum reviews per day | 200 | Anki default |
| Desired retention | 0.90 | FSRS parameter, 0.80–0.97 |
| Theme | system | system / light / dark |
| Interface language | `en` | Only English ships; strings live in `src/i18n/locales/*.json` |
| Typed game answers count as reviews | off | See Games |
| Lenient accents | off | Games accept a word with a missing or wrong accent as "almost" |

## Decks & cards

- A deck has a name, an optional description and an **"Also study in reverse"** option (Anki's
  "Basic (and reversed card)", Quizlet's "answer with definition"). With it on, every word gets a second card that
  shows the meaning and asks for the word. Turning it off deletes the reverse cards and their progress.
- A card (word) has **front** (word in the target language), **back** (translation/meaning) and an optional **example**
  sentence. Text, deck and suspension are shared by a word's forward and reverse cards; scheduling is per direction.
- **Photo** (optional) per word: choose a file, drop it or paste it in the card editor. The browser scales it to at most
  1024px and re-encodes it as WebP (stripping camera metadata) before upload; JPEG, PNG, WebP and GIF up to 2 MB are
  accepted. The photo illustrates the meaning: it shows on the answer side, and as the clue on reverse (meaning → word)
  cards. The word list shows a thumbnail. Photos are private to their owner and deleted with the word, deck or account.
  Each user has 200 MB of photo storage (about 2,000 photos as the browser prepares them); past that, the word is saved
  and the editor says the photo wasn't, so space has to be freed by removing photos.
- **Suspend / unsuspend** a word to take it out of study without deleting it; the deck list has a *Suspended* filter.
- Deck page: card list with search, status (new / learning / review + next due date), add, edit, delete, reset progress.
- Quick add keeps the dialog open after saving ("Add & next"), `Ctrl/⌘+Enter` saves.
- Export a deck as CSV (front, back, example).

## Public & private decks

- Every deck is **private** or **public**. New decks — created, imported, made by an assistant or copied from someone
  else — are private; existing decks became private when the option shipped. Private decks are visible only to their
  owner: to anyone else they answer exactly like a deck that doesn't exist.
- The deck form has a *Who can see this deck* choice; the deck page shows a Private/Public badge and a **Share** dialog
  that switches visibility and, for public decks, shows the link (`/shared/<deck id>`) with a Copy button. Public decks
  carry a globe on their deck tile.
- **Discover** (nav) searches public decks by name or description — name matches first, then most recently updated.
  Empty public decks are left out of search but still open from a link. Each result shows the word count and the
  author's first name (never the full name or email); the user's own public decks are marked *Yours*.
- A shared deck page (signed-in users only; the link survives sign-in and onboarding) shows the deck's words — front,
  back and example, in the author's order, searchable — and **Add to my decks**, which creates the viewer's own
  private copy (name, description, reverse setting and words) with every word new. The copy is independent: later
  edits by either side don't carry over.
- Photos, flags, learned/suspended state, answer history and scheduling are never shown on a public deck or copied.
- Making a deck private again hides it from search and its link at once; copies already made are unaffected.
- **Report** (shared deck page, other people's decks only): a reason — spam, hateful/harassing/sexual, illegal,
  copyright, something else — and optional details (up to 1000 characters). One report per user and deck; reporting
  again replaces it. Reports are reviewed by hand (README → Moderation); the author isn't told who reported.

## Studying

- Scheduler: FSRS (`ts-fsrs`) with short-term learning steps (1m, 10m) and relearning step (10m).
- Queue per session: due learning cards first, then due reviews (capped by the daily review limit), then new cards (capped by the daily new limit). Learning cards that become due within 20 minutes are shown again in the same session.
- Study a single deck or all decks at once.
- Card: tap / `Space` to flip. After flipping, four grades — **Again (1)**, **Hard (2)**, **Good (3)**, **Easy (4)** — each labelled with its next interval. `Space` = Good after flipping.
- Undo the last grade (`Z`).
- **Sibling burying** (Anki default behaviour): only one direction of a word is shown per session, and once one
  direction was answered today the other waits until tomorrow.
- **Leeches** (Anki default): when a card lapses for the 8th time, the word is suspended and the user is told to
  improve it; if the user unsuspends it, it is flagged again only at 12, 16, … lapses. Undoing that answer lifts the
  suspension.
- **Type the answer** (optional, remembered per device): an input replaces "Show answer"; after checking, the answer
  shows the typed text with matching characters green, wrong ones struck through red and missing ones dotted. Case and
  extra spaces are ignored, accents are not. Like Anki, typing doesn't grade the card — the learner still picks a grade.
- On a reverse card, *Listen* is disabled until the card is flipped (hearing the word would reveal the answer).
- Listen to the word using the browser's speech synthesis (`S`).
- Progress header shows remaining new / learning / review counts (Anki's colour convention).
- Session summary: cards studied, time spent, accuracy.

## Progress per word

- **Mark as learned** ("I know this", as in Memrise/Quizlet): from the round checkbox on each row of the deck list,
  the card editor, or during study (`L`). A learned word leaves daily study (both directions) but keeps its schedule,
  so unmarking puts it back where it was; games still use it. "Reset progress" also clears the mark.
- The deck page shows "N of M words learned" with a progress bar, a *Learned* badge and filter; deck tiles show the
  learned count; Stats shows how many words are learned.

- Every answer is logged: study grades (Again = wrong, Hard/Good/Easy = right) and every game answer.
- The deck's card list shows ✓ right / ✗ wrong counts per word (both directions combined).
- The card editor shows a progress panel: accuracy, right/wrong split by study sessions and games, and the latest
  20 answers as a strip of dots (hover for date and source).

- **Flags** (like Anki's): any word can carry one of 5 colour flags (blue, orange, teal, yellow, pink — the dataviz
  skill's validated categorical slots). Flags are always shown as a dot *plus* their name. Users can rename flags in
  Settings ("Tricky", "Verbs"…). Set them in the card editor or during study; filter the word list by flag.

## AI assistants (MCP)

- Settings → *Connect an AI assistant*: create named personal access tokens (`fw_…`, shown once, hashed at rest,
  max 20, revocable, last-used shown) with copy-paste setup for Claude Code, Claude Desktop and Cursor.
- MCP server at `/api/mcp` with tools to list/create/update/delete decks (including public/private) and list/add/bulk-add
  (≤2,000)/update/delete words, including learned, suspended and flag changes; plus search public decks, preview
  their words and copy one. Destructive tools are annotated as such.
- Tokens can't manage tokens; signed-in browser sessions are required for that.

## Games

Per deck, from the deck page's **Games** button. Every answer counts towards the word's progress; games change the
review schedule only with the opt-in setting below. Each game keeps a best score per deck (and per mode for timed
games) and ends with a results screen: score, right/wrong (first tries), time, "new best", words to look at again
(each with a Listen button), **Play again**, and **Practise these N**. Suspended words are left out; reverse cards
aren't used (games ask in both directions on their own). These are original games in common vocabulary-game genres,
not copies of another product's games. The research behind them is `reports/Vocabulary games for flipword.md`.

| Game | Kind | Rules | Score |
|---|---|---|---|
| Match | Recognition | Words in one column, meanings (or a word's photo) in the other; 4 pairs on the board, refilled from a queue of 8; a wrong pair lights up the right partner of the first tile. Timed (a wrong pair adds 1 s) or relaxed (no clock) | Time, lower is better; relaxed: 10 per pair found without a mistake |
| Quiz | Recognition | 10 multiple-choice questions: word→meaning, meaning→word, photo→word (words with a photo) or sound→meaning (when sound is on); 4 options; keys 1–4 | Right first answers |
| True or false | Recognition | Does this meaning belong to this word? ← / → keys. A wrong answer stops the clock and shows the true pair. Timed (60 s, pausable) or relaxed (30 statements, no clock); streak multiplier ×2 at 5, ×3 at 10, ×4 at 15 | Points (10 × multiplier) |
| Spell it | Recall | Meaning (and photo) shown; type the word; graded hints (letter count, first letter, first half) and Listen each cost 3 points | 10 per word, −3 per hint, −2 for "almost" |
| Unscramble | Scaffolded | Rebuild the word from its shuffled letters (tap or type; Backspace removes) with the meaning shown; spaces and punctuation stay fixed; a hint places the next letter | 10 per word, −3 per hint |
| Gap Line | Recall | The word's own example sentence with the word blanked and its meaning as a hint. New and learning words are picked from 4 deck words; known words (in review, or marked learned) are typed. Each answer completes the sentence, read aloud when sound is on | Typed as Spell it; a pick is 5 |
| Showdown | Recall | A boss built from the 6 weakest words (recent misses, learning, often forgotten). Each word is fought three times: pick its meaning, build it from tiles, type it. A right answer is a hit; a wrong one costs one of 5 hearts. Win by landing every hit | Pick 5, tiles/typed as above, a word that came back 2; +10 per heart left on a win |

- **Which words**: games ask the server for the words that need them most. Quiz takes missed and due words first, and
  welcomes new ones (guess-first introduction). Spell it, Unscramble and Gap Line take missed, due, then seen words,
  with new words last. Match and True or false prefer words already known, so speed builds fluency. Showdown takes the
  weakest. Gap Line's deal puts words with an example sentence first; the rest only supply wrong options.
- **Missed words come back** two questions later in the same game, once (in Showdown, until hit). The repeat is
  marked "Coming back for another try" and is practice, not points.
- **Practise these N** replays the missed words in Spell it, or in Unscramble when most of them are long (over 12
  letters). A replay doesn't set a best score.
- **Wrong options**: a new word gets random ones; a known word gets look-alikes (edit distance) and words the learner
  picked instead before (from the answer log). Options never repeat the answer's text or include another word with
  the same question text.
- **Gap Line's matcher** finds the word in its sentence: the whole front, then without a short leading article ("la
  luna" → "luna"; typing just "luna" when the gap is "La luna" is "almost"), then for a single word of 4+ letters an
  inflected form sharing a long beginning ("hablar" → "hablamos", where typing "hablar" is "almost"). In Japanese,
  Chinese, Thai and other languages without spaces, a match anywhere in the sentence counts. A word with no confident
  match is skipped.
- **Typed answers**: an accent strip (the deck's non-ASCII letters, for Latin-script decks) inserts at the caret;
  Enter doesn't submit while an IME is composing; composed and decomposed accents compare equal. With **Lenient
  accents** on, a word right except for its accents is "almost". Answers always show the right spelling after a miss.
- **Pause**: timed games have a pause button and pause by themselves when the page is hidden.
- **Sound**: a toggle in the game header, remembered on the device.
- Minimum usable words: Match 3, Quiz 4, True or false 2, Spell it and Unscramble 1, Gap Line 1 with a matching
  sentence, Showdown 4.

**Typed game answers count as reviews** (Settings → Games, off by default). For Spell it, Gap Line and Showdown's
typed answers: the first try at a word that is due now and wasn't reviewed today (in either direction) is graded like a
study answer: wrong → Again, right with a hint or "almost" → Hard, right → Good, never Easy. Producing the word from its
meaning is what a reverse card asks, so the review goes to the word's reverse card when the deck has one. Leeches work
as in study. These reviews are stored with `source = "game:<id>"`. Picking, matching and true-or-false answers never
change the schedule. The results screen says how many words were rescheduled.

Every game answer is logged with its format (verify, pair, choice, tiles, typed), hints, attempt number, time taken,
"almost", and, for a wrong pick, the word picked instead.

## Import

All parsing happens in the browser; the API receives plain JSON cards in chunks.

- **CSV / TSV / TXT** (also Quizlet exports): delimiter auto-detected, optional header row, map columns to front / back / example, preview of first rows.
- **Anki `.apkg` / `.colpkg`**: unzips, reads `collection.anki21b` (zstd), `collection.anki21` or `collection.anki2` with sql.js, lets the user map note fields to front / back / example, strips HTML and sound tags. Scheduling history and media are not imported.
- Option to skip cards whose front already exists in the target deck.
- Import into an existing deck or a new one.

## Stats

- Today: cards reviewed, time studied.
- Streak (consecutive days with at least one review).
- 30-day retention (share of review-state answers that were not "Again").
- Activity calendar, last 12 months: one square per day in week columns (week starts on the locale's first day),
  shaded in five steps relative to the busiest day. Arrow keys move by day (up/down) and week (left/right); the
  picked day's date and review count show under the grid, otherwise the year's total and active days. Scrolls
  sideways on narrow screens, starting at today. The hidden table lists days with reviews.
- Reviews per day, last 30 days.
- Due forecast, next 14 days.
- Card counts by state.
- Charts are one keyboard stop each: arrow keys, Home and End move between days (announced to screen readers);
  hovering or tapping shows the day under the pointer. A hidden table carries the same numbers.

## Achievements

Milestones that reward steady study. Each track
has tiers; a tier unlocks the moment its goal is reached and **is kept for good**, even if the number later drops
(undoing an answer, unmarking a word, deleting a deck).

| Track | Counts | Tiers |
|---|---|---|
| Study streak | Best run of consecutive days with at least one review (same day rule as Stats) | 3, 7, 14, 30, 60, 100, 180, 365 days |
| Words learned | Words marked as learned, or with a card that graduated to review (relearning included) | 10, 50, 100, 250, 500, 1,000, 2,500, 5,000, 10,000 |
| Reviews | Study answers, all time | 100, 500, 1,000, 2,500, 5,000, 10,000, 25,000, 50,000 |
| Games | Games played to the end | 1, 10, 25, 50, 100, 250, 500 |

- **Achievements page** (nav: *Achievements*): per track the current value, progress to the next tier, and every tier
  as a badge (unlocked in the track colour with its date on hover, locked ones dashed with a lock). The streak track
  also shows the current streak.
- **Unlock toast**: newly unlocked tiers are announced once (across devices) — after a study session ends, after a
  game, or on the next visit. More than two at once are summed up in one toast.
- **Streak chip** on the decks page: "N-day streak", plus "study today to keep it" while today has no review yet.
  Links to the achievements page.

## Platform

- Single Cloudflare Worker: Hono API at `/api/*`, React SPA as static assets.
- D1 (SQLite) + Drizzle ORM migrations.
- Installable PWA, online only (the service worker caches the app shell; data always comes from the API).
- Day boundaries use the client's UTC offset (`X-Tz-Offset` header).
- Light/dark themes; keyboard accessible; touch targets ≥ 44px.
- Abuse limits: Better Auth's rate limiter on sign-in (counters in D1, client IP from `cf-connecting-ip`; off only with
  dev login) and 600 API requests per minute per user (Workers rate-limit binding; 429 with `Retry-After`).
- Security headers: a strict Content-Security-Policy (no inline scripts or styles), HSTS, `frame-ancestors 'none'` and
  friends for the app (`public/_headers`); `default-src 'none'` and the same set for the API.
- No analytics, ads or third-party scripts; only the session cookie and local preferences.
- Link previews: `/`, `/privacy`, `/terms` and `/shared/*` go through the Worker, which adds `og:image`
  (`public/og-image.png`, 1200×630) and `og:url` with the request's origin; the rest of the app is static.
- `GET /api/session` is the app's sign-in check: the user, or `null` (200) when signed out, so signed-out pages log no
  errors; `/api/me` still answers 401 for scripts and assistants.
- Lighthouse (accessibility, best practices, SEO) scores 100 on every page, signed out and in.
- `GET /api/health` checks D1 and R2 and answers 503 when either fails, for uptime monitors.

## Research: features taken from existing apps

| Feature | Seen in | flipword |
|---|---|---|
| FSRS scheduling, 4 grades, daily new/review limits, learning steps | Anki | ✓ |
| Reverse cards / "answer with" the other side | Anki "Basic (and reversed card)", Quizlet | ✓ deck option |
| Leech detection: at 8 lapses, then every 4 more (12, 16, …) | Anki | ✓ |
| Type the answer, with right / wrong / missing characters marked; you still grade yourself | Anki "type in the answer", Quizlet Write, Memrise | ✓ study toggle |
| Self-rated recall after reveal | Anki (4 grades), Brainscape (1–5 confidence), Quizlet (know / don't know) | ✓ 4 grades — FSRS needs them |
| Suspend; bury siblings until tomorrow | Anki | ✓ |
| Undo last answer, edit card during review | Anki | ✓ |
| Term/definition lists, CSV/TSV import | Quizlet | ✓ |
| Audio pronunciation | Quizlet, Anki (TTS) | ✓ browser speech synthesis |
| Shuffle | Quizlet Flashcards | — not needed: the scheduler decides order |
| Starred terms | Quizlet | — not built; suspend and filters cover triage |

## Sources

- Anki manual, deck options: 20 new cards/day, 200 maximum reviews/day, learning steps `1m 10m`,
  FSRS desired retention 0.90, (re)learning steps shorter than a day when using FSRS —
  <https://docs.ankiweb.net/deck-options.html>
- Anki FAQ, spaced-repetition algorithm (FSRS vs SM-2) — <https://docs.ankiweb.net/faqs/what-spaced-repetition-algorithm.md>
- Anki manual, leeches: threshold 8 lapses, default action suspend — <https://docs.ankiweb.net/leeches.html>
- Anki deck options, bury new/review siblings — <https://docs.ankiweb.net/deck-options.html>
- Quizlet help, studying with Flashcards (shuffle, options) — <https://help.quizlet.com/hc/en-au/articles/360030988091-Studying-with-Flashcards>
- Quizlet help, starred terms — <https://help.quizlet.com/hc/en-ca/articles/360031172312-Studying-most-missed-terms-with-stars>
- Anki manual, type in the answer (`type:`, `type:ci`, `type:nc`) — <https://docs.ankiweb.net/templates/fields.html>
- Brainscape vs Quizlet (confidence-based 1–5 rating vs know/don't know) — <https://brainscape.com/academy/brainscape-vs-quizlet>
- Flashcard app comparison incl. Memrise typing mode (third-party) — <https://studycardsai.com/best-flashcard-apps-2026>
- Quizlet study modes (Match, Learn, Test, Write, Spell, Gravity, Flashcards) — <https://www.hasd.org/faculty/mattcraemer/exploringquizlet.cfm>
- Study of Quizlet use: Match is half of all use but is recognition-only — <https://e-flt.nus.edu.sg/v17n22020/platzer.pdf>
