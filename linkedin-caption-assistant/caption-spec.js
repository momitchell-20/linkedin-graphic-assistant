export const captionSpec = {
  name: "linkedin_caption_assistant",
  version: "0.1.0",
  inputs: [
    "story_headline",
    "full_story_text",
    "article_url",
    "credit_line",
    "hashtags",
  ],
  output: {
    type: "linkedin_caption",
    variants: [
      "hook_first",
      "narrative_first",
      "quote_first",
    ],
    format: [
      "<HOOK_FROM_STORY_TEXT>",
      "",
      "<BODY_PARAGRAPH_1>",
      "",
      "<BODY_PARAGRAPH_2>",
      "",
      "<BODY_PARAGRAPH_3_OPTIONAL>",
      "",
      "<CTA_LINE>",
      "",
      "<CREDIT_LINE>",
      "",
      "<HASHTAG_LINE>",
    ],
  },
  allowedRewrites: [
    {
      id: "light_readability_spacing",
      description: "Insert paragraph breaks and spacing to match the caption format.",
    },
    {
      id: "quoted_text_verbatim",
      description: "Leave any text inside quotation marks exactly as written, including pronouns and punctuation.",
    },
  ],
  forbiddenRewrites: [
    "Add facts not present in the full story text",
    "Change meaning or tone",
    "Summarize with invented language",
    "Summarize, paraphrase, bridge, or write context in new language",
    "Rephrase beyond light readability spacing changes",
    "Convert first-person narration to third-person",
    "Include reporter callouts or contact lines",
    "Introduce claims from the headline if they are not supported by the story text",
    "Change any text inside quotation marks",
  ],
  formattingRules: {
    hook: "Open with a sentence or quote copied verbatim from the story text.",
    body: "Use 2 to 4 short paragraphs pulled directly from the story text. Give readers enough context to understand the story while leaving a reason to click through.",
    cta: "Add a line in the format: Read more about <TEASER> at Business Insider: <CTA URL>. The teaser must be a specific, grounded word or short phrase based only on story text that the caption body has not already given away.",
    credit: "Use the manual photo credit field.",
    hashtags: "Add a final hashtag line, usually 3 to 5 tags.",
  },
  captionTracks: [
    {
      id: "hook_first",
      description: "Start with the strongest lead sentence from the story, then keep the rest direct and story-forward.",
      selectionRule: "Prefer this when the story has a clean, strong opening sentence that can stand alone.",
    },
    {
      id: "narrative_first",
      description: "Start with enough setup to establish the person, timing, and setting, then move into the turning point and consequence.",
      selectionRule: "Prefer this when the story has a clear turning point that needs setup before it will make sense to a reader.",
    },
    {
      id: "quote_first",
      description: "Lead with an exact quoted clause that is compelling on its own and pivotal to the central story, then add verbatim context from the rest of the article.",
      selectionRule: "Prefer this when the story contains a quote that captures the central tension, turn, or stakes and needs context after it.",
    },
  ],
};

export function renderCaptionPrompt({
  headline,
  fullStoryText,
  articleUrl,
  creditLine,
  hashtags,
  ctaTeaser = "<SHORT_VERBATIM_TEASER_FROM_UNUSED_STORY_TEXT>",
  pronounChoice = "they_their",
  variant = "hook_first",
}) {
  return `You are writing a LinkedIn caption for a Business Insider story.

Hard rules:
- Use only the full story text as source material.
- Every source-derived caption line must be copied verbatim from the story text.
- Do not summarize, paraphrase, bridge, or write context in new language.
- Leave any text inside quotation marks exactly as written; do not change wording, punctuation, or pronouns inside quotes.
- Any quoted text must include attribution from the source text, such as the sentence or clause saying who said or wrote it.
- Remove boilerplate lines such as as-told-to intros and length-and-clarity disclaimers if they appear in the source text.
- Remove reporter callouts and contact lines if they appear in the source text.
- Do not add facts, interpretation, or new language.
- Do not invent any quote, detail, or claim.

Caption mission:
- Give readers enough sense of the story to understand why it is worth reading.
- Tease the central tension, turn, or outcome without giving everything away.
- Prefer source text that establishes who is involved, when it happened, where it happened, and why the turn matters.
- For quote-first captions, choose a quote that is interesting on its own and pivotal to the larger story, not a random quoted line.

Caption format:
1. Hook paragraph
2. Body paragraphs
3. CTA line using: Read more about <TEASER> at Business Insider: <CTA URL>
4. Credit line
5. Hashtag line

CTA requirements:
- Choose <TEASER> as a specific, grounded word or short phrase based only on the story text.
- It may combine exact names/entities from the article with a simple framing phrase such as "choice to leave" when directly supported by the story.
- Capture the main topic or point of the story in a phrase or two, such as "recent shifts inside Amazon" or "Amazon's AI strategy overhaul".
- Use a teaser that points to an interesting detail the caption body has not already given away.
- Do not use attribution or source-label fragments such as "said in a post on X" as the teaser.
- Do not use vague leftover details such as "the past year" as the teaser.
- Do not summarize, paraphrase, or write a new teaser phrase.

Caption variant:
- Use this track: ${variant}
- Keep the selected track consistent from start to finish.
- Do not mix multiple tracks in the same caption.

Source headline:
${headline}

Source story text:
${fullStoryText}

Required output elements:
- CTA URL: ${articleUrl}
- Suggested CTA teaser: ${ctaTeaser}
- Photo credit: ${creditLine}
- Hashtags: ${hashtags}

Return only the final caption text.`;
}
