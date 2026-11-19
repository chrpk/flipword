# Game design for short vocabulary games (flipword)

Scope: design principles and mechanic ideas that make 1–5 minute vocab games more fun and interactive without hurting learning, plus concrete game concepts for a single-deck flashcard app (front word, back meaning, optional example sentence, optional photo, browser TTS). Existing games: Match, Quiz (4-option MC), True or false (60 s, streak multiplier), Spell it, Unscramble.

Research note: I made about 17 tool calls. Several primary papers (Habgood & Ainsworth 2011 full text, Deci et al. 1999 effect sizes, the Hicks juiciness papers) were blocked or only available as abstracts or snippets, so their exact figures are listed under Gaps rather than invented. The "Inferences" sections hold my design reasoning and the concept catalog. They are recommendations, not sourced facts.

## 1. Intrinsic integration: why the learning should BE the core mechanic

### Takeaway
Controlled studies show that games where the learning content is the core mechanic produce more learning than "chocolate-covered broccoli" designs, where a quiz gates otherwise unrelated gameplay. In the original study, children also chose to play the integrated version about 7x longer. A 2022 pre-registered replication-style study puts the mechanism in attention rather than motivation: players attend to whatever the game mechanic needs them to attend to.

### Cited Findings
- Habgood & Ainsworth (2011), "Motivating Children to Learn Effectively: Exploring the Value of Intrinsic Integration in Educational Games," *Journal of the Learning Sciences* 20(2), 169–206. Study 1: 58 children played an intrinsic, extrinsic, or control version of the maths game *Zombie Division*. Under fixed time, the intrinsic version gave stronger learning gains. In free play, children spent about 7x as long on the intrinsic version. Study 2: 16 children chose freely between the intrinsic and extrinsic variants. — [Nottingham repository record](https://nottingham-repository.worktribe.com/output/23577510/motivating-children-to-learn-effectively-exploring-the-value-of-intrinsic-integration-in-educational-games); [SHURA record](https://shura.shu.ac.uk/3556)
- Habgood's later methodological paper on Zombie Division describes the evaluation design: treatment groups vs. control, pre, post, and delayed multiple-choice tests, time on task as the behavioral measure of motivation, plus interviews. — [Zombie Division: a methodological case study (SHURA)](https://shura.shu.ac.uk/id/eprint/10652)
- Cutting & Iacovides (2022), "Learning by doing: Intrinsic Integration directs attention to increase learning in games," *Proc. ACM HCI* (CHI PLAY), pre-registered, n = 210, Pac-Man-like game. Learning was higher in the intrinsically integrated version. There were no significant differences in motivation or cognitive load. The authors conclude the effect is attentional: "players attend only to features needed for the game task and ignore task-irrelevant information." — [White Rose eprints](https://eprints.whiterose.ac.uk/id/eprint/189921/)
- Typing-game practice supports the same idea. David Bailly (Epistory, Nanotale designer) argues that typing should be added only when it makes interactions more meaningful, not for novelty. In Nanotale, word lists match enemy type (fast enemies use "RUSH", "HECTIC"; shelled enemies use "COWARD", "COY"), so the word content is part of the fiction rather than an arbitrary password. — [Bailly, "Finding gameplay depth in typing games," Game Developer, 2022](https://www.gamedeveloper.com/game-platforms/finding-gameplay-depth-in-typing-games)
- One critic contrasts *Typing of the Dead* (it "mostly swapped guns for keyboards") with Epistory's associative dictionaries. — [search summary of Game Developer "Let's talk about Epistory"](https://gamedeveloper.com/design/let-s-talk-about-epistory-typing-chronicles) (snippet-level only)

### Inferences
- **Practical test for every flipword game:** "What must the player attend to in order to win?" If the answer is the meaning-to-form link (seeing the translation and producing or recognizing the target word), the game is intrinsically integrated. If the player can win by pattern-matching letter shapes, timing taps, or exploiting position, the attention goes there instead. Cutting & Iacovides' attention result implies that this attention is what gets learned.
- **Ranking flipword's current games by this test:**
  - *Spell it* has high integration: you must produce the form from the meaning.
  - *Quiz* and *True or false* have medium integration: they need recognition, but can be gamed by elimination or speed guessing.
  - *Match* has medium integration: under time pressure, players can match on visual cues such as word length or cognates. Using a photo or TTS audio as one side reduces this.
  - *Unscramble* has medium to low integration: it can be solved as a letter puzzle without knowing the meaning, unless the meaning is the only clue, shown before the letters.
- **Chocolate-covered broccoli in vocab apps** looks like this: "answer a flashcard to earn a coin, then spend coins in an unrelated mini-game." The quiz is a toll gate. **Intrinsic** looks like this: the word you produce is the action itself. You type the word to fire at the enemy carrying its meaning, or you pick the lane whose word matches the prompt. The deck's own fields (meaning, sentence, photo, audio) are the game's objects.
- Make the **recall direction** the hard part of the mechanic. The hard part should be meaning → target form, or audio → meaning. Avoid making it speed or dexterity, which Bailly warns against for typing because WPM varies from about 20 to 110.

### Gaps
- I could not read the full Habgood & Ainsworth text (the SHURA site blocked automated access), so I don't have exact effect sizes or the delayed-test results.
- I found no controlled intrinsic-vs-extrinsic study specific to *vocabulary* games. The evidence comes from maths (Zombie Division) and an abstract task (Cutting & Iacovides).

## 2. Game feel, flow, difficulty, short-session loops, rewards, and overjustification

### Takeaway
"Juice" (responsive audiovisual feedback) has empirical support for raising perceived competence. Rewards that are expected, tangible, and contingent on doing the task can undermine intrinsic motivation. Recall-based retrieval (typing or producing the answer) beats recognition (multiple choice) for durable learning, but it is harder and less pleasant. Good vocab games therefore manage difficulty so that recall feels achievable, and use feedback (not prizes) as the main reward.

### Cited Findings
- **Juiciness:** Hicks and colleagues built a framework from developer interviews that links juiciness to *coherence*, *unobtrusive display of game state*, and *direct feedback* ("Good Game Feel: An Empirically Grounded Framework for Juicy Design," DiGRA 2018). — [DiGRA library](https://dl.digra.org/index.php/dl/article/view/936)
- One Hicks, Gerling et al. study compared gamification elements with juiciness under Self-Determination Theory. Both improved experience, but **only juiciness significantly increased perceived competence** (snippet-level, not verified in full text). — [search result pointing to Staffordshire eprint](https://eprints.staffs.ac.uk/8527/1/3677084.pdf)
- "Juicy Game Design" (CHI PLAY 2019) ran two studies: n = 40 with visual embellishments in a Frogger clone and an FPS, and n = 32 with Quake 3 Arena. — [Unpaywall/ACM DOI 10.1145/3311350.3347171](https://unpaywall.org/10.1145%2F3311350.3347171)
- Earlier counter-evidence: Juul & Begy (2016, n = 46) found no significant difference between juicy and non-juicy versions of a tile-matching game, though without standardized PX measures. — [cited in core.ac.uk PDF (search snippet)](https://core.ac.uk/download/492524999.pdf)
- Juicy *audio* has been studied separately ("That sounds juicy," TU/e, 2021). — [TU/e research portal](https://research.tue.nl/en/publications/that-sounds-juicy-exploring-juicy-audio-effects-in-video-games/)
- A 2025 paper on visual "lushness" hypothesized that heavy embellishment raises cognitive load. The snippet did not show whether this was supported. — [arXiv 2512.13695](https://arxiv.org/html/2512.13695)
- **Overjustification:** Deci, Koestner & Ryan (1999), *Psychological Bulletin* 125, 627–668, is a meta-analysis of 128 experiments. The authors' 2001 summary says "tangible rewards do indeed have a substantial undermining effect" on intrinsic motivation. It strongly supports cognitive evaluation theory. Verbal rewards (positive performance feedback) were tested as a potential *enhancer* via perceived competence. — [Deci, Koestner & Ryan 1999 PDF (UW mirror)](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf); [2001 follow-up, selfdeterminationtheory.org](https://www.selfdeterminationtheory.org/SDT/documents/2001_DeciKoestnerRyan.pdf)
- This conclusion is contested. Cameron & Pierce (1994) argued negative effects were limited and easily prevented in applied settings, and Deci et al. called that analysis "seriously flawed." — [same 1999 paper](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf); [Cameron et al. reply, "The myth continues"](https://scholarhub.vn/publication/:slug/9460423c-1ed9-4760-995d-5dd57e6628aa)
- **Recall beats recognition:** Free and cued recall formats are generally more beneficial than fill-in-the-blank, multiple-choice, and recognition. For vocabulary, recall formats are more effective for acquiring productive knowledge of orthography (spelling). — [van Eersel dissertation, EUR](https://repub.eur.nl/pub/105295/Proefschrift_GvEersel.pdf); [IRAL 2015 vocabulary study (De Gruyter)](https://www.degruyterbrill.com/document/doi/10.1515/iral-2015-0022/html?lang=en)
- Smith & Karpicke (2014): answering short-answer questions first boosted later multiple-choice performance more than the reverse. A hybrid of recall then recognition gave slightly more learning than standard MC after a few days. — [Smith & Karpicke 2014, Memory (Purdue)](https://learninglab.psych.purdue.edu/downloads/2014/2014_Smith_Karpicke_Memory.pdf); [Learning Scientists podcast ep. 3](https://learningscientists.org/learning-scientists-podcast/2017/9/20/episode-3-bite-size-research-on-retrieval-practice-formats?format=amp)
- MC lures carry a "negative suggestibility" risk: learners later reproduce wrong alternatives they saw (Roediger & Marsh), and corrective feedback reduces this (Butler & Roediger 2008). For children's vocabulary, retrieval practice helped **only with feedback**. — [van Eersel dissertation](https://repub.eur.nl/pub/105295/Proefschrift_GvEersel.pdf)
- Karpicke's 2025 review has a section on balancing retrieval *success* against retrieval *effort*, which is the core difficulty-tuning problem. — [Karpicke 2025 Retrieval-Based Learning review](https://learninglab.psych.purdue.edu/downloads/2025/2025_Karpicke_Retrieval_Based_Learning_Review.pdf)
- **Typing-game difficulty:** Timing challenges are unreliable because typing speed ranges from about 20 to 110 WPM. They also push players to hold back the final letter until the right moment, which "defeats the point." Accuracy, consistency, and spelling are better challenge levers. Typing Hearts raises the score multiplier for avoiding mistypes, and Backspace Bouken rewards "typing smarter, not faster." — [Bailly, Game Developer](https://www.gamedeveloper.com/game-platforms/finding-gameplay-depth-in-typing-games)
- **Adaptive difficulty as accessibility:** The Game Accessibility Guidelines (Intermediate) say to "Allow difficulty level to be altered during gameplay, either through settings or adaptive difficulty." — [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/full-list/)

### Inferences
- **Juice should be feedback, not decoration.** The Hicks framework (coherent, shows game state, direct feedback) fits learning well when every effect *carries information about the answer*. Examples: a satisfying "lock-in" animation on a correct recall, a shake on a wrong one, TTS speaking the correct word on reveal, and a streak meter. Ambient particles, background motion, and lush art that compete for attention do not fit. Given Cutting & Iacovides' attention finding and the lushness and cognitive-load hypothesis, decoration that draws the eye away from the word probably costs learning.
- **Always show the correct answer after an error.** Given negative suggestibility and the "only with feedback" result, every wrong MC answer should be followed by a brief corrective reveal (word + meaning + TTS). This matters most in speed modes like True or false, where a false statement such as "chien = cat" shows a wrong pairing.
- **Use streak multipliers for accuracy, not speed.** Bailly's point means flipword's True/false multiplier works best if it rewards *consecutive correct* answers. A short time window is fine, but avoid sub-second timing windows.
- **Layer formats by difficulty: recognition, then cued recall, then free recall.** Smith & Karpicke suggest recall-first helps, but recall is hard for brand-new words. A reasonable ladder within one 3-minute session is: Match/Quiz for new cards, then Unscramble (cued recall with letters given), then Spell it (free recall). Adaptive difficulty can move individual cards up the ladder based on their history.
- **Adaptive difficulty that fits a flashcard app:** Per-card mastery (as in SRS) can decide *which* cards appear and *in which format*. Use more distractor-similar MC options for strong cards and first-letter hints for weak ones. This keeps success near the "achievable but effortful" zone Karpicke describes, without changing global speed.
- **Rewards and overjustification:** Avoid *expected, tangible, task-contingent* currencies (coins per correct answer, spent in a cosmetic shop) as the primary motivator. Prefer informational rewards: personal bests, "words mastered" counts, visible card-level progress, and the competence boost from juice. Small, unexpected celebratory moments (a new personal best, a first perfect round) are less likely to be read as control than a promised payout.
- **Short-session loop template (1–5 min):** instant start with no menu, then a 60–180 s round, then a results screen that shows *which words* were missed with TTS, a one-tap "retry missed words" button, and a one-tap "play again." The results screen is where the learning gets consolidated, so it should be the most information-dense screen.

### Gaps
- I could not get the 1999 meta-analysis effect sizes (e.g., for expected tangible rewards vs. verbal rewards). The search returned only the qualitative summary.
- I could not verify the Hicks gamification-vs-juiciness result beyond the abstract snippet, including the sample size and effect magnitude.
- I found no study testing juice specifically in vocabulary or flashcard games, and none measuring whether juice changes learning outcomes as opposed to player experience.
- I found no source specifically on "flow" (Csikszentmihalyi) applied to vocab games, or on variable-ratio reward schedules in learning apps, within this tool budget.

## 3. Proven arcade and puzzle genres adapted to vocab recall, plus a concept catalog

### Takeaway
Typing-action games (Typing of the Dead, Epistory, Nanotale, Typing Hearts) show that word entry can carry real depth when players choose *which* word to enter, when words mean something in the fiction, and when accuracy rather than raw speed is rewarded. For vocab, the key adaptation is that the prompt is the *meaning* (or photo or audio) and the player must produce the *target word*. That turns a typing-skill game into a retrieval game.

### Cited Findings
- Epistory (FishingCactus, Unity, released 30 March 2016) received very positive reviews and sold over 100k copies including bundles. The team's retrospective calls typing-adventure a genre with few design resources. — [Epistory retrospective, GameDev.net](https://gamedev.net/blogs/entry/2262740-epistory-retrospective-looking-back-over-the-development-of-epistory); [Bailly, Game Developer](https://www.gamedeveloper.com/game-platforms/finding-gameplay-depth-in-typing-games)
- Depth sources in typing games, according to Bailly:
  - Real *choice* about which input to make. Typing Hearts uses an ever-refilling word grid instead of a strict sequence.
  - Enemy archetypes with different speeds and HP.
  - Spells typed by name. In Epistory, ICE pauses an enemy and FIRE burns the next word.
  - Emergent combos. In Typing Hearts, a word can contain a shorter word, and some players saved words to score both.
  - Resource optimization. In Backspace Bouken, contractions save limited "space."
  - Bailly also warns that exotic inputs that aren't really typing break immersion.
  — [Game Developer](https://www.gamedeveloper.com/game-platforms/finding-gameplay-depth-in-typing-games)
- Typing of the Dead is a spinoff of the House of the Dead on-rails shooters. Adding the typing mechanic had "enormous implications for very basic elements of the game design." — [Giant Bomb feature on Typing of the Dead: Overkill](https://www.giantbomb.com/articles/how-typing-of-the-dead-overkill-almost-never-lived/1100-4794/) (snippet-level)
- Meta-analytic evidence that digital games help vocabulary in general: a DGBL-in-EFL meta-analysis reports d ≈ 0.695 across 25 studies, and Chen, Tseng & Hsiao (2018, BJET) reached a similar conclusion. Pooled gamification/English effects cluster around g ≈ 0.3–0.5. — [HKIER ej v42n2](https://hkier.cuhk.edu.hk/en/publications/ej-v42n2-113-141); [MDPI Sustainability 15(14) 11325 (Korean EFL meta-analysis, g = 0.517, 11 studies, n = 610)](https://mdpi.com/2071-1050/15/14/11325)
- Caveat: a 2026 second-order meta-analysis of 55 meta-analyses found gamification beneficial on average but likely overstated for cognitive outcomes. Precision-adjusted estimates are about 0.29–0.48. — reported in search results via [MDPI Education Sciences 15(12) 1568](https://www.mdpi.com/2227-7102/15/12/1568) (I could not confirm which result maps to which paper, so verify)

### Inferences: concept catalog for a single flipword deck
Each concept lists: **core loop**, **what is recalled (integration)**, **engagement hooks**, **learning risks and mitigations**, and **input**.

**Arcade**
1. **Meteor Words (typing shooter, falling meanings).** Meanings, photos, or TTS audio fall toward a city, and the player types the *target word* to destroy each one.
   - Recall: meaning → form (free recall).
   - Hooks: choice of target (Typing Hearts-style), enemy archetypes (long words are slow tanks, short words are fast), and a spell layer where typing a special deck word triggers a power such as a freeze.
   - Risks: speed punishing slow typists, and accents. Mitigations: game speed scales with the player's measured rate, the accent-tolerant mode in §5, and accuracy rewarded over speed.
   - Input: keyboard, with the on-screen keyboard on mobile. On phones, use fewer simultaneous enemies.
2. **Lane Runner (endless runner, 3 lanes).** A meaning appears overhead, three gates carry candidate target words, and the player swipes into the correct lane.
   - Recall: recognition, but under motion.
   - Hooks: distance, speed ramp, and near-miss juice.
   - Risk: it is pure recognition, so position or length cues get exploited. Mitigation: distractors drawn from the deck with similar length.
   - Upgrade: on "boost" segments, the gates show only first letters (cued recall).
   - Input: swipe or arrow keys. Ideal for one-hand phone play.
3. **Word Defense (tower defense lite).** Enemies labelled with meanings walk a path, and each tower is "loaded" by recalling the matching word. Typed words do more damage than words picked from a list.
   - Hooks: placement strategy and between-wave choices.
   - Risk: strategy can crowd out recall attention. Keep the strategy layer thin so recall stays the action.
4. **Boss Battle.** A boss has HP equal to N words. Each attack requires recalling a deck word; correct answers hit, wrong answers let the boss strike back. Boss phases escalate format (MC, then letters given, then type it).
   - Hooks: a dramatic arc in under 3 minutes. This is a natural "end of session" capstone.
   - Learning: the boss's weak points are the player's weakest cards, so practice is targeted.
5. **Chain / Combo mode.** One continuous stream where consecutive correct answers grow a chain. A wrong answer breaks the chain but immediately re-queues the missed word 2–3 items later (spaced micro-repeat).
   - Hooks: streak tension, as in flipword's True or false, but the multiplier is accuracy-based.

**Puzzle**
6. **Deck Crossword.** A small crossword auto-generated from deck words, with clues as meanings, photos, or example sentences with a blank.
   - Recall: cued recall (crossing letters as hints).
   - Hooks: completion satisfaction and a daily-puzzle format.
   - Risk: the generator needs words that share letters, so small decks may fail. Fall back to a word-search-style "find the word for this meaning."
7. **Deduction (Wordle-like, original rules).** The hidden word is a deck card with its meaning shown. The player guesses letters or the full word and gets per-letter position feedback. Only deck words are valid guesses.
   - Recall: guided production. Each guess must be a real deck word, so guessing itself is retrieval.
   - Hooks: one shared "word of the day" per deck, and a shareable result grid. The grid must be flipword's own visual format, not a clone.
8. **Hangman-style "Rescue."** A meaning plus blanks. The player picks letters on a keyboard limited to the alphabet of the target language, accents included. A balloon or rope deflates on misses.
   - Learning: weaker than full recall because letter-guessing is partly strategic. Best as an easy, early-stage mode.
9. **Memory / Concentration.** A face-down grid of word cards and meaning, photo, or audio cards. Flip two at a time to find pairs.
   - Learning: retrieval of position plus association. Risk: positional memory dominates. Mixing modalities (audio ↔ word) adds listening practice.
10. **Sentence Builder.** The example sentence is split into word tiles, the target word is highlighted or missing, and the player drags tiles into order or fills the blank from three options.
    - Learning: context and collocation, which flashcards lack. Only cards with example sentences qualify, so this works as a bonus mode.
    - Hook: TTS reads the finished sentence as the reward, which is informational juice.

**Narrative**
11. **Expedition (short roguelite run).** A 3-minute run through 5–7 "rooms." Each room is a mini-challenge drawn from the formats above, using deck words. Between rooms, the player picks one of three perks (extra hint, freeze timer, double points on typed answers).
    - Hooks: run-to-run variety, build choices, and a visible map.
    - Learning: perks should modify *support* (hints, time), never skip recall.
    - Progression: cosmetic map themes unlocked by *mastery* (cards mastered), not by grinding, which avoids the overjustification trap.
12. **Letters Home (story frame).** A light narrative (for example, a traveller writing postcards) where each postcard has blanks filled with deck words, and the story text reuses the card's example sentence.
    - Hook: curiosity about the next postcard. Low cost if the frames are templates.

**Social** (see §4)

13. **Ghost Run.** Replay any timed game against a translucent "ghost" of your personal best: its progress bar, and which words it got right.
    - Hooks: self-competition without the low-rank harm of public leaderboards.
14. **Deck Duel (async friend challenge).** Share a link: "beat my 42 on Spanish Food." The friend plays the same seed (same words, same order).
    - Hook: social reciprocity. The results screen compares word by word.
15. **Live Room (Kahoot/Gimkit-style, for classes or families).** A host projects or shares a room code, and players answer on their phones. Rounds rotate formats, and the scoreboard shows the top 5 plus "most improved."

### Gaps
- I found no published postmortem with retention data for ZType or for typing games used specifically for *foreign-language* vocab (as opposed to touch typing).
- I found no evidence comparing specific genres (runner vs. shooter vs. crossword) on vocab learning outcomes. The concept catalog is design reasoning, not tested.
- Roguelite progression in educational games: I found no sourced studies within budget.

## 4. Social mechanics: async challenges, live multiplayer, ghosts, leaderboards

### Takeaway
Competition helps engagement on average but splits players. High-rank positions motivate, low-rank positions tend to demotivate, especially low performers and less competitive people. Duolingo's experience shows that *matched, small, rotating* leagues can produce large engagement gains. Classroom Kahoot/Gimkit studies report vocab benefits, but mostly from small, quasi-experimental designs.

### Cited Findings
- **Duolingo leaderboards** (Jorge Mazal, former CPO, Lenny's Newsletter, 28 Feb 2023):
  - After launch, overall learning time rose **17%**, and highly engaged learners (≥1 h/day, 5 days/week) **tripled**. D1 and D7 retention improved significantly.
  - Users are matched with others of similar engagement from the prior week, with weekly promotion between named leagues. The design is borrowed from FarmVille 2.
  - An earlier Gardenscapes-style "moves counter" gamification took a couple of months to build and was "completely neutral" on retention and DAU, so it was abandoned.
  - The share of DAU with 7+ day streaks rose about 3x to more than half of DAU.
  - Over four years: CURR up 21%, daily churn of best users down by more than 40%, DAU up 4.5x.
  — [Lenny's Newsletter](https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth)
- Duolingo has run more than 600 experiments on streaks over four years. Tying streaks to XP confused users, and simplifying to "one lesson a day" worked better. — [summary of Lenny's Podcast with Jackson Shuttleworth](https://www.recall.it/summary/lennys-podcast/behind-the-product-duolingo-streaks-or-jackson-shuttleworth-group-pm-retention-team) (secondary summary)
- **Leaderboard harm to low performers:** High-rank positions boost motivation, while low-rank positions harm it. Low-performing students are more likely to be demotivated by competitive elements. Highly competitive users engage more, while low-competitive users are "driven away." Some studies find low-ranked learners showed *more* effort and better retention. — [Utrecht MA thesis, "Exploring the inner workings of the leaderboard"](https://studenttheses.uu.nl/handle/20.500.12932/42867); [Internet Research (Emerald) 2023, doi 10.1108/INTR-12-2021-0897](https://www.emerald.com/insight/content/doi/10.1108/intr-12-2021-0897/full/html); [ECGBL paper](https://papers.academic-conferences.org/index.php/ecgbl/article/download/1593/1652/6517) (mostly secondary or thesis-level; primary studies not verified)
- **Kahoot/Gimkit:** A Finnish MA thesis (49 upper-secondary students) found both Gimkit and Kahoot beneficial for L2 vocabulary. A Thai 8-week course reported higher motivation and engagement and lower anxiety, with stronger effects for vocabulary than grammar. A Bahraini study (n = 54) found better vocabulary-practice results in the gamified group. Kahoot's own blog synthesis of studies across about 10 countries is promotional. — [Saari & Varjonen thesis, Univ. Turku](https://utupub.fi/bitstream/handle/10024/152962/MA_Thesis_Saari_Varjonen.pdf); [Kahoot blog, Oct 2026](https://kahoot.com/blog/2026/10/26/kahoot-impact-what-research-from-11-countries-reveals-about-learning-english-with-kahoot/)
- Methodological caveat: most Kahoot vocab research relies on self-report surveys, not experiments, which gives limited evidence of actual vocabulary improvement. — [Indonesian study, jim.unisma.ac.id](https://jim.unisma.ac.id/index.php/jp3/article/download/31879/24017)

### Inferences
- **Lead with ghost racing and personal bests.** They give the motivating "beat a target" tension with no low-rank humiliation, and they work offline (PWA).
- **Async seeded challenges ("beat my score on this deck") are the cheapest form of social play.** They need only a share link encoding deck, seed, and score, with no real-time infrastructure. They also produce a *fair* comparison because both players get the same words.
- **Shared or public deck leaderboards should copy Duolingo's mitigations:** small, matched groups; weekly resets; showing nearby ranks rather than the global top; and "most improved" or "personal best" boards alongside raw score.
- **Live multiplayer is a classroom feature, not a solo-retention feature.** The evidence is classroom-based. It needs a server (WebSocket), which flipword (a static PWA) may not have, so build it last.
- **Optimize scoring for accuracy.** In Kahoot-style speed scoring, fast guessers win. Weighting correctness over response time, as in §2, stops social competition from rewarding guessing over recall.

### Gaps
- I found no study isolating *ghost racing* or *async friend challenges* in educational games. The recommendation relies on reasoning from leaderboard-harm findings.
- I found no Gimkit-specific peer-reviewed research beyond the Finnish thesis.
- Duolingo league figures are company self-reports via a newsletter, not peer-reviewed. League group sizes were not disclosed.

## 5. Accessibility and mobile constraints

### Takeaway
The highest-risk elements in flipword's genre are timers, colour-only feedback, motion, and typing accented characters on mobile keyboards. The Game Accessibility Guidelines list concrete fixes (adjustable speed, no essential precise timing, a background-motion toggle, no colour-only or sound-only information, large touch targets, a no-fail practice mode), and most are cheap in a web app.

### Cited Findings
- Game Accessibility Guidelines relevant to short word games (tier in brackets):
  - "Include an option to adjust the game speed" [Basic, Motor]
  - "Allow difficulty level to be altered during gameplay, either through settings or adaptive difficulty" [Intermediate]
  - "Do not make precise timing essential to gameplay" [Advanced]
  - "Avoid flickering images and repetitive patterns" [Basic]
  - "Provide an option to turn off / hide background movement" [Intermediate]
  - "Avoid any sudden unexpected movement or events" [Advanced]
  - "Ensure no essential information is conveyed by a fixed colour alone" [Basic]
  - "Use an easily readable default font size" [Basic]
  - "Allow the font size to be adjusted" [Advanced]
  - "Ensure interactive elements / virtual controls are large and well spaced, particularly on small or touch screens" [Basic]
  - "Ensure controls are as simple as possible, or provide a simpler alternative" [Basic]
  - "Ensure screenreader support for mobile devices" [Intermediate]
  - "Ensure no essential information is conveyed by sounds alone" [Basic]
  - "Provide separate volume controls or mutes for effects, speech and background / music" [Basic]
  - "Include a means of practicing without failure, such as a practice level or sandbox mode" [Intermediate]
  - "Ensure that all settings are saved/remembered" [Basic]
  — [Game Accessibility Guidelines full list](https://gameaccessibilityguidelines.com/full-list/)
- Typing speed varies from about 20 to 110 WPM, so time-pressure typing excludes slower typists. — [Bailly, Game Developer](https://www.gamedeveloper.com/game-platforms/finding-gameplay-depth-in-typing-games)

### Inferences
- **Timers:** Every timed game (Match, True or false, the arcade concepts) should offer a relaxed or untimed mode, or a speed setting. Best scores should be stored per mode so relaxed play doesn't feel second-class.
- **`prefers-reduced-motion`:** Respect it by replacing falling or scrolling with static fade-ins, turning off screen shake and particles, and keeping the *informational* feedback (icons, text, sound).
- **Feedback channels:** Right/wrong should be shown by icon and text as well as colour (for example, a check or cross plus "Correct: *perro*"), and TTS should be optional, never the only carrier of information.
- **Accented characters on mobile:** Native OS keyboards need a long-press for accents, which is slow mid-game. Options:
  - An accent strip above the input with the deck language's special characters (é, ñ, ü, ß, and so on).
  - A "lenient accents" setting that accepts *perro* for *perró*, still shows the correct form, and scores it slightly lower.
  - For touch-first arcade modes, a custom letter-tile keyboard containing only the target word's letters plus decoys. This is cued recall, an Unscramble variant, and it avoids OS keyboard popups that cover half the screen.
- **Screen readers:** Arcade games with moving targets are inherently hard to make accessible. An `aria-live` region announcing the prompt and result works for turn-based modes (Quiz, Spell it, Deduction, Crossword clue-by-clue), so screen-reader users should have a turn-based path through every deck.
- **Short attention windows:** Rounds should be pausable and resumable (phone interruptions). Rounds of 60–180 s fit; a 5-minute round should be built from short segments (as in Expedition rooms) so stopping midway still produces a results screen.
- **Touch targets:** Lane Runner's swipe should also allow tapping on lane areas. Grid games (Match, Memory) must cap grid size on phones to keep targets large.

### Gaps
- I found no source specifically on accented-character input UX in mobile language games, so the recommendations above are design reasoning.
- I found no data on what share of flipword-like users enable reduced motion or use screen readers.

## 6. Evidence on what keeps players returning vs. what feels gimmicky

### Takeaway
The strongest retention evidence comes from Duolingo's self-reported experiments. Matched leaderboards and simplified streak mechanics had large effects. A complex in-lesson gamification mechanic (limited moves) was neutral. Academic meta-analyses show moderate learning gains from games and gamification (about g 0.3–0.7), but likely inflated. The evidence warns that mechanics bolted on without changing *what the player attends to* add cost without adding learning.

### Cited Findings
- Duolingo's first gamification attempt, a Gardenscapes-style finite-moves counter, took a couple of months and produced "completely neutral" results, with no change in retention or DAU and almost no user feedback. Leaderboards then had "a huge and almost immediate impact." — [Lenny's Newsletter (Mazal)](https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth)
- Users reaching a 10-day streak had substantially reduced drop-off, but Mazal notes this is partly correlation and selection bias. — [Lenny's Newsletter](https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth)
- Retention is most fragile in the first 7 days. Changing a button from "continue" to "commit to my goal" increased retention. — [podcast summary](https://www.recall.it/summary/lennys-podcast/behind-the-product-duolingo-streaks-or-jackson-shuttleworth-group-pm-retention-team) (secondary)
- The referral program increased new users by only 3%. — [Lenny's Newsletter](https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth)
- Meta-analyses: digital games for EFL vocabulary d ≈ 0.695 (25 studies), and gamification in Korean EFL g = 0.517 (11 studies, 610 participants). A second-order meta-analysis finds cognitive effects likely overstated (about 0.29–0.48 precision-adjusted). — [HKIER](https://hkier.cuhk.edu.hk/en/publications/ej-v42n2-113-141); [MDPI 2023](https://mdpi.com/2071-1050/15/14/11325); [MDPI Educ. Sci. 2025](https://www.mdpi.com/2227-7102/15/12/1568)
- Juiciness, but not gamification elements, significantly raised perceived competence in one Hicks et al. study. — [Staffordshire eprint](https://eprints.staffs.ac.uk/8527/1/3677084.pdf) (snippet-level)
- Intrinsic integration: about 7x voluntary time on task (Habgood & Ainsworth 2011) and higher learning (Cutting & Iacovides 2022). — sources as in §1

### Inferences
- **Mechanics that feel gimmicky:** systems layered on top that do not change the core action, such as moves counters, coin shops, and badges for trivial actions. **Mechanics that retain:** those that create a reason to come back *tomorrow*, such as streaks kept simple, weekly matched competition, a daily seeded puzzle, and visible mastery growth. Those that create a reason to play *one more round* also retain, such as ghost/PB, "retry missed words," and short rounds.
- **Recommended retention hooks for flipword, ordered roughly by cost:**
  1. A results screen with missed words and one-tap "retry missed."
  2. Personal best plus a ghost.
  3. A per-deck mastery bar visible on the deck page.
  4. A daily seeded "deck puzzle" (Deduction or Crossword).
  5. A simple daily streak (any one game counts).
  6. Async seeded challenge links.
  7. Small matched leagues on public decks.
  8. A live room.
- **Mastery visibility** is the bridge between fun and learning. If games feed per-card mastery and the deck page shows it, every game session visibly moves something meaningful. That is an informational, competence-supporting reward rather than a controlling one (per cognitive evaluation theory in Deci et al.).

### Gaps
- I found no published D1, D7, or D30 retention curves for educational *mini-game* apps (outside Duolingo's self-reports), and no GDC talk transcripts on vocab-game retention within budget.
- I found no evidence on which of flipword's current five games players prefer or replay. Internal analytics (replay rate per game, session length, best-score improvement) would fill this gap.
- I did not reach Plass, Homer & Kinzer, Gee, or Mayer's *Computer Games for Learning* directly. Mayer's value-added and cognitive-consequences framing and Plass's integrated design framework would strengthen §1–2 if a later pass can access them.
