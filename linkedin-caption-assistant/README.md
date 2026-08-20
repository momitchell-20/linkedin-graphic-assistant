# LinkedIn Caption Assistant

This folder defines the caption generator as a structured spec instead of an ad hoc prompt.

Goals:
- Keep every caption grounded in the source story text.
- Keep source-derived caption text verbatim from the story.
- Give readers enough context to understand the story and want to read more without giving everything away.
- For narrative captions, include setup that establishes the person, timing, and setting before the turning point.
- For quote-first captions, lead with a quote that is both compelling on its own and pivotal to the larger story.
- Leave any text inside quotation marks exactly as written, including pronouns and punctuation.
- Attribute every quote using source text that identifies who said or wrote it.
- Remove boilerplate disclaimer lines when they appear:
  - as-told-to intros
  - edited-for-length-and-clarity notes
  - reporter callouts and contact lines
- Keep photo credit as a manual input.
- Use a CTA teaser in the form `Read more about <specific grounded teaser> at Business Insider`, choosing a detail the caption body has not already given away and avoiding attribution fragments like `said in a post on X`.
- CTA teasers should capture the story's main topic or point, such as `recent shifts inside Amazon`, not vague leftover details like `the past year`.
- Preserve the recurring caption format:
  - hook
  - body paragraphs
  - CTA
  - credit
  - hashtags

The next step is to wire this spec into a prompt builder or API route.
