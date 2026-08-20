(function attachLinkedInCaptionAssistant(global) {
  const TRACK_ORDER = ["hook_first", "narrative_first", "quote_first"];
  const TRACKS = {
    hook_first: {
      title: "Hook first",
      reason: "Open with the sharpest lead sentence, then keep the rest direct and story-forward.",
    },
    narrative_first: {
      title: "Narrative first",
      reason: "Open with enough setup to establish the person, timing, and setting, then move into the turning point and consequence.",
    },
    quote_first: {
      title: "Quote first",
      reason: "Lead with an exact quoted clause that points to the central story, then add verbatim context from the rest of the article.",
    },
  };

  const FIRST_PERSON_COUNT_RE = /\b(i|me|my|mine|we|us|our|ours)\b/gi;
  const FIRST_PERSON_TEST_RE = /\b(i|me|my|mine|we|us|our|ours)\b/i;
  const QUOTE_RE = /["“”]/g;
  const NARRATIVE_ANCHOR_RE = /\b(after|before|when|once|then|because|instead|eventually|ultimately|decided|quit|left|moved|founded|started|changed|realized|realised|transi(?:tion|tioning))\b/i;
  const PIVOTAL_QUOTE_RE = /\b(changed|realized|realised|learned|decided|quit|left|started|failed|failure|risk|problem|challenge|hard|scary|surprised|needed|wanted|knew|felt|money|career|family|business|customer|future|never|always|first|last)\b/i;
  const WEAK_QUOTE_RE = /^(yes|no|maybe|okay|thanks|thank you|i agree|that's right|that is right|it was fine)$/i;
  const QUOTE_ATTRIBUTION_RE = /\b(said|says|wrote|writes|told|shared|posted|according to|recalled|explained|added)\b/i;
  const CTA_ATTRIBUTION_RE = /\b(said|says|wrote|writes|posted|shared|told|according)\b/i;
  const CTA_SOURCE_RE = /\b(?:post|message|statement|interview|email|x|twitter|instagram|tiktok|linkedin)\b/i;
  const CTA_TEASER_RE = /\b(stepping down|steps down|stress|illness|health|startup|neolab|internally|challenge|decision|problem|failure|risk|turning point|behind|inside|future|company|cofounder|founder|lab|strategy|overhaul|overhauling|restructuring|reorganizing|frontier|layoffs|shutdown|shifts|OpenAI|chief technology officer|CTO|Mira Murati)\b/i;
  const FLAT_CTA_TEASER_RE = /\b(specific diagnosis|diagnosis|post on X|message|statement|past year|people familiar with the matter)\b/i;
  const LEAVE_ANGLE_RE = /\b(stepping down|steps down|step down|leave|leaving|left|resign|resigning|departure)\b/i;
  const LEAVE_CONTEXT_RE = /\b(stepping down|steps down|step down|leave|leaving|left|resign|resigning|departure|stress|illness|health|workload|decision|continue|pace)\b/i;
  const KEYWORD_STOP_WORDS = new Set([
    "about", "after", "again", "also", "because", "before", "being", "business", "could", "every",
    "first", "from", "have", "into", "more", "over", "said", "says", "their", "there", "they",
    "this", "through", "under", "when", "where", "which", "while", "with", "would",
  ]);
  const PRONOUN_SETS = {
    she_her: {
      label: "she/her",
      subject: "she",
      object: "her",
      possessiveAdjective: "her",
      possessivePronoun: "hers",
      reflexive: "herself",
      contractionBe: "she's",
      bePresent: "is",
      bePast: "was",
      havePresent: "has",
      doPresent: "does",
      singular: true,
    },
    he_his: {
      label: "he/his",
      subject: "he",
      object: "him",
      possessiveAdjective: "his",
      possessivePronoun: "his",
      reflexive: "himself",
      contractionBe: "he's",
      bePresent: "is",
      bePast: "was",
      havePresent: "has",
      doPresent: "does",
      singular: true,
    },
    they_their: {
      label: "they/their",
      subject: "they",
      object: "them",
      possessiveAdjective: "their",
      possessivePronoun: "theirs",
      reflexive: "themselves",
      contractionBe: "they're",
      bePresent: "are",
      bePast: "were",
      havePresent: "have",
      doPresent: "do",
      singular: false,
    },
  };
  const DEFAULT_PRONOUN_SET = "they_their";
  const PLURAL_THIRD_PERSON = PRONOUN_SETS.they_their;
  const BOILERPLATE_PATTERNS = [
    /this as-told-to essay is based on a conversation with[^.?!]*[.?!]?\s*/gi,
    /the following has been edited for length and clarity[.?!]?\s*/gi,
    /it has been edited for length and clarity[.?!]?\s*/gi,
    /do you have a story to share[^.?!]*[.?!]?\s*/gi,
    /if so, please reach out to the reporter at\s+[^\s]+@[^\s]+\s*\.?\s*com[.?!]?\s*/gi,
  ];

  function splitParagraphs(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .split(/\n\s*\n+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function splitSentences(text) {
    return String(text || "")
      .replace(/\r\n/g, " ")
      .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function stripOpeningBoilerplate(text) {
    let cleaned = String(text || "");
    for (const pattern of BOILERPLATE_PATTERNS) {
      cleaned = cleaned.replace(pattern, "");
    }
    return cleaned.replace(/\s{2,}/g, " ").trim();
  }

  function stripBoilerplate(text) {
    return stripOpeningBoilerplate(text);
  }

  function hasQuotedText(text) {
    return /["“”]/.test(String(text || ""));
  }

  function transformOutsideQuotes(text, transform) {
    const source = String(text || "");
    let result = "";
    let buffer = "";
    let inQuote = false;

    for (const char of source) {
      if (char === '"' || char === "“" || char === "”") {
        result += inQuote ? buffer : transform(buffer);
        buffer = "";
        result += char;
        inQuote = !inQuote;
      } else {
        buffer += char;
      }
    }

    result += inQuote ? buffer : transform(buffer);
    return result;
  }

  function getPronounSet(choice) {
    return PRONOUN_SETS[choice] || PRONOUN_SETS[DEFAULT_PRONOUN_SET];
  }

  function capitalize(text) {
    const value = String(text || "");
    return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
  }

  function shouldCapitalizeReplacement(input, offset) {
    const before = String(input || "")
      .slice(0, offset)
      .replace(/[\s"'“”’)\]]+$/g, "");
    const lastChar = before.slice(-1);
    return !lastChar || /[.!?]/.test(lastChar);
  }

  function replaceWithCase(text, regex, replacementFactory) {
    return String(text || "").replace(regex, (match, ...args) => {
      const input = args[args.length - 1];
      const offset = args[args.length - 2];
      const replacement = replacementFactory(match, input, offset);
      return shouldCapitalizeReplacement(input, offset) ? capitalize(replacement) : replacement;
    });
  }

  function conjugateVerb(baseVerb, singular) {
    const verb = String(baseVerb || "").toLowerCase();
    if (!singular) {
      return verb;
    }

    const irregulars = {
      do: "does",
      go: "goes",
      have: "has",
      be: "is",
      am: "is",
      is: "is",
      are: "is",
      was: "was",
      were: "was",
      make: "makes",
      say: "says",
      see: "sees",
      use: "uses",
      live: "lives",
      give: "gives",
      take: "takes",
      leave: "leaves",
      drive: "drives",
      write: "writes",
      bring: "brings",
      buy: "buys",
      try: "tries",
      fly: "flies",
      study: "studies",
      spy: "spies",
      pay: "pays",
      play: "plays",
      own: "owns",
      know: "knows",
      feel: "feels",
      need: "needs",
      want: "wants",
      get: "gets",
      keep: "keeps",
      help: "helps",
      move: "moves",
      plan: "plans",
      work: "works",
      love: "loves",
      start: "starts",
      lead: "leads",
      build: "builds",
      create: "creates",
      decide: "decides",
      order: "orders",
      save: "saves",
      support: "supports",
      think: "thinks",
      tell: "tells",
      read: "reads",
      run: "runs",
      set: "sets",
      spend: "spends",
      find: "finds",
      live: "lives",
      stay: "stays",
    };

    if (Object.prototype.hasOwnProperty.call(irregulars, verb)) {
      return irregulars[verb];
    }

    if (/[^aeiou]y$/i.test(verb)) {
      return `${verb.slice(0, -1)}ies`;
    }

    if (/(s|x|z|ch|sh|o)$/i.test(verb)) {
      return `${verb}es`;
    }

    return `${verb}s`;
  }

  function convertFirstPersonToPronoun(text, pronounChoice = DEFAULT_PRONOUN_SET) {
    const pronoun = getPronounSet(pronounChoice);
    return transformOutsideQuotes(String(text || ""), (segment) => {
      let cleaned = segment;

      cleaned = replaceWithCase(cleaned, /\bI(?:['’]m)\b/g, () => pronoun.contractionBe);
      cleaned = replaceWithCase(cleaned, /\bI(?:['’]ve)\b/g, () => `${pronoun.subject}'ve`);
      cleaned = replaceWithCase(cleaned, /\bI(?:['’]d)\b/g, () => `${pronoun.subject}'d`);
      cleaned = replaceWithCase(cleaned, /\bI(?:['’]ll)\b/g, () => `${pronoun.subject}'ll`);
      cleaned = replaceWithCase(cleaned, /\bI am\b/gi, () => `${pronoun.subject} ${pronoun.bePresent}`);
      cleaned = replaceWithCase(cleaned, /\bI was\b/gi, () => `${pronoun.subject} ${pronoun.bePast}`);
      cleaned = replaceWithCase(cleaned, /\bI have\b/gi, () => `${pronoun.subject} ${pronoun.havePresent}`);
      cleaned = replaceWithCase(cleaned, /\bI do\b/gi, () => `${pronoun.subject} ${pronoun.doPresent}`);
      cleaned = replaceWithCase(cleaned, /\bI will\b/gi, () => `${pronoun.subject} will`);
      cleaned = replaceWithCase(cleaned, /\bI can\b/gi, () => `${pronoun.subject} can`);
      cleaned = replaceWithCase(cleaned, /\bI could\b/gi, () => `${pronoun.subject} could`);
      cleaned = replaceWithCase(cleaned, /\bI should\b/gi, () => `${pronoun.subject} should`);
      cleaned = replaceWithCase(cleaned, /\bI would\b/gi, () => `${pronoun.subject} would`);
      cleaned = replaceWithCase(cleaned, /\bI may\b/gi, () => `${pronoun.subject} may`);
      cleaned = replaceWithCase(cleaned, /\bI might\b/gi, () => `${pronoun.subject} might`);
      cleaned = replaceWithCase(cleaned, /\bI must\b/gi, () => `${pronoun.subject} must`);
      cleaned = replaceWithCase(cleaned, /\bI\s+([A-Za-z]+)\b/g, (match) => {
        const verb = match.replace(/^I\s+/i, "");
        const lowerVerb = verb.toLowerCase();
        const commonVerbs = [
          "use", "work", "feel", "want", "need", "go", "make", "know", "think", "get", "say", "see",
          "love", "keep", "try", "start", "lead", "live", "help", "give", "take", "own", "leave",
          "build", "create", "decide", "move", "plan", "spend", "sell", "buy", "order", "save",
          "support", "choose", "write", "read", "speak", "tell", "run", "handle", "automate", "stay",
          "find", "set", "pay",
        ];

        if (!commonVerbs.includes(lowerVerb)) {
          return match;
        }

        return `${pronoun.subject} ${conjugateVerb(lowerVerb, pronoun.singular)}`;
      });

      cleaned = replaceWithCase(cleaned, /\bI\b/g, () => pronoun.subject);
      cleaned = replaceWithCase(cleaned, /\bme\b/gi, () => pronoun.object);
      cleaned = replaceWithCase(cleaned, /\bmy\b/gi, () => pronoun.possessiveAdjective);
      cleaned = replaceWithCase(cleaned, /\bmine\b/gi, () => pronoun.possessivePronoun);
      cleaned = replaceWithCase(cleaned, /\bmyself\b/gi, () => pronoun.reflexive);
      cleaned = replaceWithCase(cleaned, /\bwe\b/gi, () => PLURAL_THIRD_PERSON.subject);
      cleaned = replaceWithCase(cleaned, /\bus\b/gi, () => PLURAL_THIRD_PERSON.object);
      cleaned = replaceWithCase(cleaned, /\bour\b/gi, () => PLURAL_THIRD_PERSON.possessiveAdjective);
      cleaned = replaceWithCase(cleaned, /\bours\b/gi, () => PLURAL_THIRD_PERSON.possessivePronoun);
      cleaned = replaceWithCase(cleaned, /\bourselves\b/gi, () => PLURAL_THIRD_PERSON.reflexive);

      return cleaned;
    });
  }

  function cleanParagraphs(paragraphs) {
    const cleaned = paragraphs
      .map((paragraph) => stripOpeningBoilerplate(paragraph))
      .filter(Boolean);

    return cleaned.length ? cleaned : paragraphs.filter(Boolean);
  }

  function extractQuotedClause(text) {
    const match = String(text || "").match(/["“][^"”]+["”]/);
    return match ? match[0].trim() : "";
  }

  function extractQuotedClauses(text) {
    return String(text || "").match(/["“][^"”]{4,280}["”]/g) || [];
  }

  function hasQuoteAttribution(text) {
    return hasQuotedText(text) && QUOTE_ATTRIBUTION_RE.test(text);
  }

  function getAttributedQuoteExcerpt(paragraphs, quoteIndex, quote) {
    const paragraph = String(paragraphs[quoteIndex] || "").trim();
    if (hasQuoteAttribution(paragraph)) {
      return paragraph;
    }

    const sentenceWindow = [
      ...splitSentences(paragraphs[quoteIndex - 1] || ""),
      ...splitSentences(paragraph),
      ...splitSentences(paragraphs[quoteIndex + 1] || ""),
    ].filter(Boolean);
    const quoteSentenceIndex = sentenceWindow.findIndex((sentence) => sentence.includes(quote));
    if (quoteSentenceIndex >= 0) {
      const quoteSentence = sentenceWindow[quoteSentenceIndex];
      if (hasQuoteAttribution(quoteSentence)) {
        return quoteSentence;
      }

      const previousSentence = sentenceWindow[quoteSentenceIndex - 1] || "";
      const nextSentence = sentenceWindow[quoteSentenceIndex + 1] || "";
      if (QUOTE_ATTRIBUTION_RE.test(previousSentence)) {
        return [previousSentence, quoteSentence].join(" ");
      }
      if (QUOTE_ATTRIBUTION_RE.test(nextSentence)) {
        return [quoteSentence, nextSentence].join(" ");
      }
    }

    return paragraph || quote;
  }

  function getKeywords(text) {
    return normalizeForComparison(text)
      .split(" ")
      .filter((word) => word.length >= 4 && !KEYWORD_STOP_WORDS.has(word));
  }

  function scoreQuotedClause(quote, span, index, contextText, headline) {
    const quoteText = cleanCtaTeaser(quote);
    const wordCount = countWords(quoteText);
    const headlineKeywords = getKeywords(headline);
    const normalizedQuote = normalizeForComparison(quoteText);
    const normalizedContext = normalizeForComparison(contextText);
    const keywordOverlap = headlineKeywords.filter((word) => normalizedQuote.includes(word) || normalizedContext.includes(word)).length;
    let score = 0;

    if (WEAK_QUOTE_RE.test(quoteText)) {
      score -= 12;
    }

    if (wordCount >= 6 && wordCount <= 24) {
      score += 10;
    } else if (wordCount >= 4 && wordCount <= 32) {
      score += 5;
    } else if (wordCount > 32) {
      score -= 2;
    } else {
      score -= 8;
    }

    if (PIVOTAL_QUOTE_RE.test(quoteText)) {
      score += 6;
    }

    if (/[?!]/.test(quoteText)) {
      score += 2;
    }

    if (FIRST_PERSON_TEST_RE.test(quoteText)) {
      score += 2;
    }

    if (NARRATIVE_ANCHOR_RE.test(contextText) || PIVOTAL_QUOTE_RE.test(contextText)) {
      score += 5;
    }

    score += Math.min(keywordOverlap, 3) * 2;

    if (index <= 6) {
      score += 1;
    }

    return score;
  }

  function findBestQuote(paragraphs, story = {}) {
    let best = null;

    paragraphs.forEach((paragraph, index) => {
      const contextText = [
        paragraphs[index - 1],
        paragraph,
        paragraphs[index + 1],
      ].filter(Boolean).join(" ");

      for (const quote of extractQuotedClauses(paragraph)) {
        const candidate = {
          quote: quote.trim(),
          index,
          score: scoreQuotedClause(quote, paragraph, index, contextText, story.headline || ""),
        };

        if (!best || candidate.score > best.score) {
          best = candidate;
        }
      }
    });

    return best;
  }

  function uniqueParagraphs(paragraphs) {
    const seen = new Set();
    const unique = [];

    for (const paragraph of paragraphs) {
      const normalized = String(paragraph || "").trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      unique.push(normalized);
    }

    return unique;
  }

  function countMatches(text, regex) {
    const matches = String(text || "").match(regex);
    return matches ? matches.length : 0;
  }

  function scoreTrack(story, paragraphs) {
    const text = [story.headline, story.fullStoryText].filter(Boolean).join(" ");
    const quoteCount = countMatches(text, QUOTE_RE);
    const firstPersonCount = countMatches(text, FIRST_PERSON_COUNT_RE);
    const transitionCount = countMatches(text, /\b(quit|left|moved|started|founded|joined|decided|changed|transi(?:tion|tioning))\b/gi);

    if (quoteCount >= 4) {
      return "quote_first";
    }

    if (firstPersonCount >= 4 || transitionCount >= 2) {
      return "narrative_first";
    }

    if (paragraphs.some((paragraph) => /["“”]/.test(paragraph))) {
      return "quote_first";
    }

    return "hook_first";
  }

  function findParagraphIndex(paragraphs, predicate) {
    return paragraphs.findIndex((paragraph) => predicate(paragraph));
  }

  function getStorySpans(paragraphs, sourceText) {
    if (paragraphs.length > 1) {
      return paragraphs;
    }

    const sentences = splitSentences(sourceText);
    return sentences.length ? sentences : paragraphs;
  }

  function findTrackStartIndex(track, spans) {
    if (!spans.length) {
      return 0;
    }

    if (track === "quote_first") {
      const quoteIndex = findParagraphIndex(spans, (span) => /["“”]/.test(span) || /\bsaid\b/i.test(span));
      return quoteIndex >= 0 ? quoteIndex : 0;
    }

    if (track === "narrative_first") {
      const narrativeIndex = findParagraphIndex(spans, (span) => NARRATIVE_ANCHOR_RE.test(span) || FIRST_PERSON_TEST_RE.test(span));
      if (narrativeIndex > 0) {
        return narrativeIndex;
      }

      if (spans.length > 1) {
        return 1;
      }

      return 0;
    }

    return 0;
  }

  function selectParagraphs(track, paragraphs, story = {}) {
    const usable = cleanParagraphs(paragraphs);
    if (!usable.length) {
      return [];
    }

    if (track === "quote_first") {
      const quoteCandidate = findBestQuote(usable, story);
      if (quoteCandidate) {
        const quoteIndex = quoteCandidate.index;
        const quote = quoteCandidate.quote || extractQuotedClause(usable[quoteIndex]) || usable[quoteIndex];
        const quotedLead = getAttributedQuoteExcerpt(usable, quoteIndex, quote);
        const context = [
          usable[0],
          ...usable.slice(quoteIndex + 1, quoteIndex + 3),
          ...usable.slice(Math.max(0, quoteIndex - 2), quoteIndex),
        ].filter((span) => span !== quotedLead && span !== usable[quoteIndex]);
        return [quotedLead, ...context.slice(0, 2)].filter(Boolean);
      }
    }

    if (track === "narrative_first") {
      const narrativeIndex = findParagraphIndex(usable, (span) => NARRATIVE_ANCHOR_RE.test(span) || FIRST_PERSON_TEST_RE.test(span));
      const turnIndex = narrativeIndex >= 0 ? narrativeIndex : Math.min(1, usable.length - 1);
      if (turnIndex <= 0) {
        return usable.slice(0, Math.min(usable.length, 4));
      }

      const setup = turnIndex > 1 ? [usable[0], usable[turnIndex - 1]] : [usable[0]];
      const consequence = usable.slice(turnIndex + 1, turnIndex + 3);
      return uniqueParagraphs([
        ...setup,
        usable[turnIndex],
        ...consequence,
      ]).slice(0, 4);
    }

    const startIndex = findTrackStartIndex(track, usable);
    const endIndex = Math.min(usable.length, startIndex + 3);
    return usable.slice(startIndex, endIndex);
  }

  function ensureQuoteAttribution(paragraphs, sourceSpans, story = {}) {
    const normalizedParagraphs = [...paragraphs];
    const firstQuoteIndex = normalizedParagraphs.findIndex((paragraph) => hasQuotedText(paragraph));
    if (firstQuoteIndex < 0 || hasQuoteAttribution(normalizedParagraphs[firstQuoteIndex])) {
      return normalizedParagraphs;
    }

    const quoteCandidate = findBestQuote(cleanParagraphs(sourceSpans), story);
    if (quoteCandidate) {
      const usable = cleanParagraphs(sourceSpans);
      normalizedParagraphs[firstQuoteIndex] = getAttributedQuoteExcerpt(usable, quoteCandidate.index, quoteCandidate.quote);
    }

    return normalizedParagraphs;
  }

  function normalizeCreditLine(story) {
    return String(story.creditLine || "").trim();
  }

  function normalizeHashtagLine(story) {
    const tags = [];
    const headlineWords = String(story.headline || "")
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4);

    if (story.vertical) {
      tags.push(`#${String(story.vertical).replace(/\s+/g, "")}`);
    }

    headlineWords.forEach((word) => {
      if (word.length >= 4) {
        tags.push(`#${word.replace(/[^A-Za-z0-9]/g, "")}`);
      }
    });

    const unique = [];
    for (const tag of tags) {
      if (tag && !unique.includes(tag)) {
        unique.push(tag);
      }
      if (unique.length >= 4) {
        break;
      }
    }

    return unique.length ? unique.join(" ") : "#BusinessInsider";
  }

  function getArcGuidance(track) {
    if (track === "quote_first") {
      return "Lead with an exact quoted clause that is compelling on its own and pivotal to the central story. Then add 1 to 2 context paragraphs copied verbatim from the rest of the article; do not output only the quote.";
    }

    if (track === "narrative_first") {
      return "Start with setup copied verbatim from the article so the reader understands the person, timing, and setting. Then move into the turning point and one consequence without giving everything away.";
    }

    return "Lead with the strongest hook sentence, then move through the key body paragraphs in a clean, direct arc.";
  }

  function countWords(text) {
    return String(text || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }

  function trimWords(text, maxWords) {
    const words = String(text || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!Number.isFinite(maxWords) || maxWords <= 0 || words.length <= maxWords) {
      return String(text || "").trim();
    }

    return words.slice(0, maxWords).join(" ");
  }

  function normalizeForComparison(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getWordTokens(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[’]/g, "'")
      .match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) || [];
  }

  function getAllowedPronounTokens(pronounChoice) {
    const pronoun = getPronounSet(pronounChoice);
    return new Set([
      ...Object.values(pronoun),
      ...Object.values(PLURAL_THIRD_PERSON),
    ]
      .filter((value) => typeof value === "string")
      .flatMap((value) => getWordTokens(value)));
  }

  function usesOnlySourceWords(text, sourceText, pronounChoice) {
    const sourceWords = new Set(getWordTokens(sourceText));
    const allowedPronounWords = getAllowedPronounTokens(pronounChoice);
    const words = getWordTokens(text);

    if (!words.length) {
      return false;
    }

    return words.every((word) => sourceWords.has(word) || allowedPronounWords.has(word));
  }

  function filterSourceGroundedParagraphs(paragraphs, sourceText, pronounChoice) {
    return paragraphs.filter((paragraph) => usesOnlySourceWords(paragraph, sourceText, pronounChoice));
  }

  function cleanCtaTeaser(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/^[,;:\s]+/, "")
      .replace(/[,;:.!?\s]+$/, "")
      .replace(/^["“”]+|["“”]+$/g, "")
      .trim();
  }

  function escapeRegExp(text) {
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function extractFullPersonNames(text) {
    const names = String(text || "").match(/\b[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,2}\b/g) || [];
    const organizationWords = /\b(Lab|Labs|Company|Companies|Business|Insider|OpenAI|Twitter|LinkedIn|X)\b/;
    const unique = [];

    for (const name of names) {
      const cleaned = cleanCtaTeaser(name);
      if (!cleaned || organizationWords.test(cleaned) || unique.includes(cleaned)) {
        continue;
      }

      unique.push(cleaned);
    }

    return unique;
  }

  function resolveFullNameFromSurname(surname, fullNames) {
    const normalizedSurname = String(surname || "").trim().toLowerCase();
    if (!normalizedSurname) {
      return "";
    }

    return fullNames.find((name) => name.split(/\s+/).slice(-1)[0].toLowerCase() === normalizedSurname) || "";
  }

  function extractPersonName(text) {
    const source = String(text || "");
    const fullNames = extractFullPersonNames(source);
    const sentences = splitSentences(source);
    const leaveSentences = sentences.filter((sentence) => LEAVE_CONTEXT_RE.test(sentence));

    for (const sentence of leaveSentences) {
      const fullNameInSentence = fullNames.find((name) => sentence.includes(name));
      if (fullNameInSentence) {
        return fullNameInSentence;
      }

      const surnameMatch = sentence.match(/\b([A-Z][A-Za-z.'-]+)\s+(?:said|wrote|posted|shared|told)\b/);
      if (surnameMatch) {
        const resolved = resolveFullNameFromSurname(surnameMatch[1], fullNames);
        if (resolved) {
          return resolved;
        }
      }
    }

    const patterns = [
      /\b(?:cofounder|co-founder|founder|executive|researcher|leader)\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,2})\b/,
      /\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,2})\s+(?:said|wrote|posted|shared|told)\b/,
    ];

    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match && match[1]) {
        const personName = cleanCtaTeaser(match[1]);
        if (fullNames.includes(personName)) {
          return personName;
        }
      }
    }

    return "";
  }

  function extractCompanyName(text, personName = "") {
    const source = String(text || "");
    const personPattern = personName ? escapeRegExp(personName) : "[A-Z][A-Za-z.'-]+(?:\\s+[A-Z][A-Za-z.'-]+){1,2}";
    const patterns = [
      new RegExp(`\\b([A-Z][A-Za-z&.'-]+(?:\\s+[A-Z][A-Za-z&.'-]+){1,5})\\s+(?:cofounder|co-founder|founder)\\s+${personPattern}\\b`),
      /\b(?:cofounder|co-founder|founder)\s+of\s+([A-Z][A-Za-z&.'-]+(?:\s+[A-Z][A-Za-z&.'-]+){1,5})\b/,
      /\b([A-Z][A-Za-z&.'-]+(?:\s+[A-Z][A-Za-z&.'-]+){1,5})\s+was\s+founded\b/,
    ];

    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match && match[1]) {
        return cleanCtaTeaser(match[1].replace(/\s+(?:said|wrote|posted|shared|told)\b.*$/i, ""));
      }
    }

    return "";
  }

  function getSpecificCtaCandidates(sourceText) {
    const candidates = [];
    const personName = extractPersonName(sourceText);
    const companyName = extractCompanyName(sourceText, personName);
    const hasLeaveAngle = LEAVE_ANGLE_RE.test(sourceText);
    const normalized = normalizeForComparison(sourceText);

    if (personName && companyName && hasLeaveAngle) {
      addCtaCandidate(candidates, `${personName}'s choice to leave ${companyName}`, sourceText, 30);
    }

    const companyMatches = sourceText.match(/\b(?:Amazon|Apple|Google|Meta|Microsoft|OpenAI|Netflix|Tesla|Nvidia|Anthropic)\b/g) || [];
    const company = companyMatches[0] || "";
    if (company && /\b(overhauling|overhaul|restructuring|reorganizing|refocusing|winding down|shutting down|strategy|layoffs|shutdown)\b/i.test(sourceText)) {
      const topic = /\bAI\b/.test(sourceText) ? "AI strategy" : "strategy";
      addCtaCandidate(candidates, `recent shifts inside ${company}`, sourceText, 34);
      addCtaCandidate(candidates, `${company}'s ${topic} overhaul`, sourceText, 32);
      addCtaCandidate(candidates, `${company}'s ${topic} restructuring`, sourceText, 30);
    }

    if (company && normalized.includes("artificial general intelligence")) {
      addCtaCandidate(candidates, `changes inside ${company}'s AGI organization`, sourceText, 31);
    }

    return candidates;
  }

  function isWeakCtaTeaser(teaser) {
    const cleaned = cleanCtaTeaser(teaser);
    const normalized = normalizeForComparison(cleaned);

    if (!normalized || normalized.split(" ").length > 12) {
      return true;
    }

    if (CTA_ATTRIBUTION_RE.test(cleaned) && CTA_SOURCE_RE.test(cleaned)) {
      return true;
    }

    if (/^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3}\s+(?:said|wrote|posted|shared|told)\b/.test(cleaned)) {
      return true;
    }

    return false;
  }

  function addCtaCandidate(candidates, teaser, sourceSentence, weight = 0) {
    const cleaned = cleanCtaTeaser(teaser);
    if (isWeakCtaTeaser(cleaned)) {
      return;
    }

    candidates.push({
      teaser: cleaned,
      sourceSentence,
      weight,
    });
  }

  function getCtaCandidates(sentence) {
    const candidates = [];
    const quotedClause = extractQuotedClause(sentence);
    if (quotedClause) {
      addCtaCandidate(candidates, quotedClause, sentence, CTA_TEASER_RE.test(quotedClause) ? 5 : 1);
    }

    const cleaned = cleanCtaTeaser(sentence);
    const phrasePatterns = [
      { pattern: /\bfounded by\s+([^,.;!?]{3,90})/i, weight: 12 },
      { pattern: /\b(former\s+OpenAI\s+[^,.;!?]{3,90})/i, weight: 12 },
      { pattern: /\b(OpenAI\s+[^,.;!?]{3,90})/i, weight: 10 },
      { pattern: /\b(?:citing|over|amid|because of|due to)\s+([^,.;!?]{3,90})/i, weight: 8 },
      { pattern: /\b(?:known internally as|called|named)\s+([^,.;!?]{3,90})/i, weight: 6 },
      { pattern: /\b(?:about|after|before|during|inside|behind)\s+([^,.;!?]{3,90})/i, weight: 5 },
      { pattern: /\b(?:why|how)\s+([^,.;!?]{3,90})/i, weight: 5 },
      { pattern: /\b(stepping down|steps down|specific diagnosis|consistent stress and workload|health can sustain|pace a startup requires|hard and sad decision|building a neolab)\b/i, weight: 9 },
    ];

    for (const { pattern, weight } of phrasePatterns) {
      const match = cleaned.match(pattern);
      if (match && match[1]) {
        addCtaCandidate(candidates, trimWords(match[1], 8), sentence, weight);
      } else if (match && match[0]) {
        addCtaCandidate(candidates, match[0], sentence, weight);
      }
    }

    const properNounMatches = cleaned.match(/\b(?:[A-Z][A-Za-z.'-]+|OpenAI|CTO)(?:\s+(?:[A-Z][A-Za-z.'-]+|OpenAI|CTO|chief|technology|officer)){1,6}\b/g) || [];
    for (const properNounMatch of properNounMatches) {
      addCtaCandidate(candidates, properNounMatch, sentence, /OpenAI|Murati|CTO|chief technology officer/i.test(properNounMatch) ? 9 : 3);
    }

    addCtaCandidate(candidates, trimWords(cleaned, 8), sentence, CTA_ATTRIBUTION_RE.test(cleaned) ? -6 : 0);
    return candidates;
  }

  function scoreCtaCandidate(candidate, bodyText) {
    const normalizedTeaser = normalizeForComparison(candidate.teaser);
    let score = candidate.weight;

    if (!normalizedTeaser || bodyText.includes(normalizedTeaser)) {
      return -Infinity;
    }

    if (CTA_TEASER_RE.test(candidate.teaser)) {
      score += 8;
    }

    if (FLAT_CTA_TEASER_RE.test(candidate.teaser)) {
      score -= 18;
    }

    if (CTA_ATTRIBUTION_RE.test(candidate.teaser)) {
      score -= 8;
    }

    if (CTA_SOURCE_RE.test(candidate.teaser)) {
      score -= 5;
    }

    const wordCount = normalizedTeaser.split(" ").length;
    if (wordCount >= 2 && wordCount <= 5) {
      score += 4;
    } else if (wordCount > 6) {
      score -= 2;
    }

    return score;
  }

  function isAcceptablePlannedCtaTeaser(teaser, sourceText) {
    const cleaned = cleanCtaTeaser(teaser);
    if (isWeakCtaTeaser(cleaned)) {
      return false;
    }

    if (FLAT_CTA_TEASER_RE.test(cleaned)) {
      return false;
    }

    const leaveMatch = cleaned.match(/^(.+?)'s choice to leave\b/i);
    if (leaveMatch) {
      const plannedPerson = cleanCtaTeaser(leaveMatch[1]);
      const mainPerson = extractPersonName(sourceText);
      return !mainPerson || normalizeForComparison(plannedPerson) === normalizeForComparison(mainPerson);
    }

    return true;
  }

  function selectCtaTeaser(sourceSpans, bodyParagraphs, story = {}) {
    const bodyText = normalizeForComparison(joinParagraphs(bodyParagraphs));
    const bodyPieces = bodyParagraphs
      .map((paragraph) => normalizeForComparison(paragraph))
      .filter(Boolean);
    const sentences = sourceSpans.flatMap((span) => splitSentences(span));
    const sourceText = [
      story.headline,
      ...sourceSpans,
    ].filter(Boolean).join(" ");

    let bestCandidate = null;

    for (const candidate of getSpecificCtaCandidates(sourceText)) {
      const score = scoreCtaCandidate(candidate, bodyText);
      if (score !== -Infinity && (!bestCandidate || score > bestCandidate.score)) {
        bestCandidate = {
          ...candidate,
          score,
        };
      }
    }

    for (const sentence of sentences) {
      const normalizedSentence = normalizeForComparison(sentence);
      const overlapsBody = bodyPieces.some((bodyPiece) => normalizedSentence.includes(bodyPiece) || bodyPiece.includes(normalizedSentence));
      if (!normalizedSentence || bodyText.includes(normalizedSentence) || overlapsBody) {
        continue;
      }

      for (const candidate of getCtaCandidates(sentence)) {
        const score = scoreCtaCandidate(candidate, bodyText);
        if (score === -Infinity) {
          continue;
        }

        if (!bestCandidate || score > bestCandidate.score) {
          bestCandidate = {
            ...candidate,
            score,
          };
        }
      }
    }

    return bestCandidate ? bestCandidate.teaser : "";
  }

  function buildCtaLine(articleUrl, ctaTeaser) {
    const teaser = cleanCtaTeaser(ctaTeaser);
    if (teaser) {
      return `Read more about ${teaser} at Business Insider: ${articleUrl}`;
    }

    return `Read more on Business Insider: ${articleUrl}`;
  }

  function joinParagraphs(paragraphs) {
    return paragraphs.filter(Boolean).join("\n\n");
  }

  function normalizeSentenceSpacing(text) {
    return transformOutsideQuotes(String(text || ""), (segment) => segment
      .split("\n")
      .map((line) => line
        .replace(/\.\s*(?=[A-Za-z0-9"“”'(\[])/g, ". ")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/[ \t]+$/g, ""))
      .join("\n"));
  }

  function buildPrompt(story, track, paragraphs, options = {}) {
    const creditLine = normalizeCreditLine(story);
    const hashtagLine = normalizeHashtagLine(story);
    const articleUrl = String(story.articleUrl || story.url || "").trim() || "<ARTICLE_URL>";
    const sourceText = options.sourceText
      || joinParagraphs(paragraphs)
      || String(story.fullStoryText || "").trim()
      || "<FULL_STORY_TEXT>";
    const lengthLabel = Number.isFinite(options.lengthMin) && Number.isFinite(options.lengthMax)
      ? `${options.lengthMin}-${options.lengthMax}`
      : "not set";

    return [
      "Write one LinkedIn caption for a Business Insider story.",
      "",
      "Hard rules:",
      "- Use only the full story text as source material.",
      "- Every source-derived caption line must be copied verbatim from the story text.",
      "- Do not summarize, paraphrase, bridge, or write context in new language.",
      "- Leave any text inside quotation marks exactly as written; do not change wording, punctuation, or pronouns inside quotes.",
      "- Any quoted text must include attribution from the source text, such as the sentence or clause saying who said or wrote it.",
      "- Remove boilerplate lines such as as-told-to intros and length-and-clarity disclaimers if they appear in the source text.",
      "- Remove reporter callouts such as 'Do you have a story to share' and 'please reach out to the reporter' lines if they appear in the source text.",
      "- Do not add facts, interpretation, or new language.",
      "",
      "Caption mission:",
      "- Give readers enough sense of the story to understand why it is worth reading.",
      "- Tease the central tension, turn, or outcome without giving everything away.",
      "- Prefer source text that establishes who is involved, when it happened, where it happened, and why the turn matters.",
      "",
      `Caption track: ${track}`,
      `Track guidance: ${TRACKS[track].reason}`,
      `Arc: ${getArcGuidance(track)}`,
      `Length window: ${lengthLabel} words`,
      `Opening shape: ${track === "quote_first" ? "Start with an attributed quote exactly as written, then follow with verbatim context from the article." : track === "narrative_first" ? "Start with setup before the turn using verbatim article text, then include the turning point." : "Start with the strongest hook sentence copied verbatim."}`,
      "",
      "Caption format:",
      "1. Hook paragraph",
      "2. Body paragraphs",
      "3. CTA line using: Read more about <TEASER> at Business Insider: <CTA URL>",
      "4. Credit line",
      "5. Hashtag line",
      "",
      "CTA requirements:",
      "- Choose <TEASER> as a specific, grounded word or short phrase based only on the story text.",
      "- It may combine exact names/entities from the article with a simple framing phrase such as 'choice to leave' when directly supported by the story.",
      "- Capture the main topic or point of the story in a phrase or two, such as 'recent shifts inside Amazon' or 'Amazon's AI strategy overhaul'.",
      "- Use a teaser that points to an interesting detail the caption body has not already given away.",
      "- Do not use attribution or source-label fragments such as 'said in a post on X' as the teaser.",
      "- Do not use vague leftover details such as 'the past year' as the teaser.",
      "- Do not summarize, paraphrase, or write a new teaser phrase.",
      "",
      `Source headline: ${story.headline || "<HEADLINE>"}`,
      "",
      "Source story text:",
      sourceText,
      "",
      "Required output elements:",
      `- CTA URL: ${articleUrl}`,
      `- Suggested CTA teaser: ${options.ctaTeaser || "<SHORT_VERBATIM_TEASER_FROM_UNUSED_STORY_TEXT>"}`,
      `- Photo credit: ${creditLine || "[enter photo credit in the field above]"}`,
      `- Hashtags: ${hashtagLine}`,
      "",
      "Return only the final caption text.",
    ].join("\n");
  }

  function buildCaptionPrompt(story, options = {}) {
    const baseText = stripBoilerplate(story.fullStoryText || "");
    const paragraphs = splitParagraphs(baseText);
    const spans = getStorySpans(paragraphs, baseText);
    const requestedTrack = String(options.track || "").trim();
    const track = TRACKS[requestedTrack] ? requestedTrack : scoreTrack(story, spans);
    return buildPrompt(story, track, paragraphs, {
      ...options,
      sourceText: stripBoilerplate(String(options.sourceText || "<FULL_STORY_TEXT>").trim()) || "<FULL_STORY_TEXT>",
    });
  }

  function buildCaptionPreview(story) {
    return buildCaptionDraft(story);
  }

  function buildCaptionDraft(story, options = {}) {
    const baseText = stripBoilerplate(story.fullStoryText || "");
    const paragraphs = splitParagraphs(baseText);
    const spans = getStorySpans(paragraphs, baseText);
    const requestedTrack = String(options.track || "").trim();
    const track = TRACKS[requestedTrack] ? requestedTrack : "hook_first";
    const pronounChoice = String(options.pronounChoice || DEFAULT_PRONOUN_SET).trim();
    const plannedParagraphs = Array.isArray(options.selectedParagraphs)
      ? options.selectedParagraphs.map((paragraph) => String(paragraph || "").trim()).filter(Boolean)
      : [];
    const selectedParagraphs = plannedParagraphs.length ? plannedParagraphs : selectParagraphs(track, spans, story);
    const lengthMin = Number.isFinite(Number(options.lengthMin)) ? Number(options.lengthMin) : NaN;
    const lengthMax = Number.isFinite(Number(options.lengthMax)) ? Number(options.lengthMax) : NaN;
    const creditLine = normalizeCreditLine(story);
    const hashtagLine = normalizeHashtagLine(story);
    const articleUrl = String(story.articleUrl || story.url || "").trim() || "<ARTICLE_URL>";
    let bodyParagraphs = filterSourceGroundedParagraphs(selectedParagraphs, baseText, pronounChoice);
    if (!bodyParagraphs.length && plannedParagraphs.length) {
      bodyParagraphs = filterSourceGroundedParagraphs(selectParagraphs(track, spans, story), baseText, pronounChoice);
    }
    if (!bodyParagraphs.length) {
      bodyParagraphs = [...selectedParagraphs];
    }
    if (track === "quote_first") {
      bodyParagraphs = ensureQuoteAttribution(bodyParagraphs, spans, story);
    }
    const rawPlannedCtaTeaser = String(options.ctaTeaser || "").trim();
    const plannedCtaTeaser = isAcceptablePlannedCtaTeaser(rawPlannedCtaTeaser, baseText) ? rawPlannedCtaTeaser : "";
    const preliminaryCtaTeaser = plannedCtaTeaser || selectCtaTeaser(spans, bodyParagraphs, story);
    const preliminaryCtaLine = buildCtaLine(articleUrl, preliminaryCtaTeaser);
    const captionBaseWords = countWords(`${preliminaryCtaLine} (Credit: ${creditLine}) ${hashtagLine}`);
    if (Number.isFinite(lengthMax)) {
      const bodyBudget = Math.max(20, lengthMax - captionBaseWords);
      while (bodyParagraphs.length > 1 && countWords(joinParagraphs(bodyParagraphs)) > bodyBudget) {
        bodyParagraphs.pop();
      }
      if (countWords(joinParagraphs(bodyParagraphs)) > bodyBudget && !hasQuotedText(bodyParagraphs[0])) {
        bodyParagraphs[0] = trimWords(bodyParagraphs[0], Math.max(30, bodyBudget));
      }
    }

    bodyParagraphs = bodyParagraphs.map((paragraph) => normalizeSentenceSpacing(paragraph));
    const ctaTeaser = plannedCtaTeaser || selectCtaTeaser(spans, bodyParagraphs, story);
    const ctaLine = buildCtaLine(articleUrl, ctaTeaser);
    const prompt = buildPrompt(story, track, bodyParagraphs, {
      lengthMin,
      lengthMax,
      pronounChoice,
      ctaTeaser,
      sourceText: baseText || joinParagraphs(bodyParagraphs) || "<FULL_STORY_TEXT>",
    });

    const captionLines = [
      bodyParagraphs.length ? joinParagraphs(bodyParagraphs) : "<CAPTION_SOURCE_TEXT>",
      "",
      ctaLine,
      "",
      `(Credit: ${creditLine})`,
      "",
      hashtagLine,
    ];
    const caption = captionLines.join("\n");

    return {
      track,
      trackTitle: TRACKS[track].title,
      trackReason: TRACKS[track].reason,
      prompt,
      selectedParagraphs: bodyParagraphs,
      caption,
      wordCount: countWords(caption),
      articleUrl,
      ctaTeaser,
      ctaLine,
      creditLine,
      hashtagLine,
      pronounChoice,
      pronounLabel: getPronounSet(pronounChoice).label,
      hasFullStoryText: Boolean(String(story.fullStoryText || "").trim()),
      arcGuidance: getArcGuidance(track),
      lengthMin,
      lengthMax,
      lengthWindow: Number.isFinite(lengthMin) && Number.isFinite(lengthMax) ? `${lengthMin}-${lengthMax}` : "",
    };
  }

  global.LinkedInCaptionAssistant = {
    tracks: TRACKS,
    trackOrder: TRACK_ORDER,
    buildCaptionPreview,
    buildCaptionPrompt,
    buildCaptionDraft,
  };
})(window);
