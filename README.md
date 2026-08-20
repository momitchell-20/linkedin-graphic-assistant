# LinkedIn Graphics Bot

Standalone local app for composing LinkedIn graphics in the Business Insider style.

## What it does

- Preserves the source photo and only crops or resizes as needed.
- Adds a white BI logo near the top center.
- Renders a headline at the bottom with a dark fade for readability.
- Exports a 4:5 PNG suitable for LinkedIn.

## Notes

- The default logo asset lives at `assets/bi-logo.jpg`.
- You can upload a Garnett font file in the UI if you want the exact headline face.
- This is a plain frontend project so it can be deployed to Vercel later without a ChatGPT site.
- The story pipeline now includes a caption builder button that uses the linked caption assistant helper to pick one best-fit caption track from the full story text when it is available.
- The `Build caption` button can fetch the story body from Snowflake through the backend route when the Snowflake SQL API env vars are configured.

## Google Sheets mode

If the Vercel `api/stories` route is configured, the stories panel reads from Google Sheets and uses the sheet as the source of truth.

By default:

- Reads from `Current Suggestions`
- Writes status updates back to `LinkedIn Story Suggestions`

That setup is fine even if `LinkedIn Story Suggestions` is rebuilt every day, as long as the tab name stays the same and the expected columns stay in place. The app only writes individual cells, not the whole tab.
The current writeback schema expects approval fields in columns `I:M` and a posted flag in `Already Posted?`.
For Slack approval image uploads, the app uploads the file to Google Drive, then serves it back through a public image proxy on this app so Slack can unfurl it. The Drive file itself stays private inside the `linkedin graphics` shared drive.
Make sure the Drive folder ID is set in `GOOGLE_DRIVE_APPROVAL_FOLDER_ID` and the service account has access to that shared drive.

Required env vars:

- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON` or `GOOGLE_SERVICE_ACCOUNT_FILE`
- `GOOGLE_DRIVE_APPROVAL_FOLDER_ID`
- If the sheet includes a full text field, the API will expose it to the caption builder when the row is loaded.

For Snowflake-backed caption loading, add:

- `SNOWFLAKE_ACCOUNT_URL`
- `SNOWFLAKE_USER`
- `SNOWFLAKE_JWT_ISSUER`
- `SNOWFLAKE_JWT_SUBJECT`
- `SNOWFLAKE_PRIVATE_KEY` or `SNOWFLAKE_PRIVATE_KEY_FILE`
- `SNOWFLAKE_PRIVATE_KEY_PASSPHRASE` if the private key is encrypted
- Optional context vars: `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_ROLE`, `SNOWFLAKE_DATABASE`, `SNOWFLAKE_SCHEMA`

The Snowflake route looks up the story by URL first, then falls back to the normalized slug and returns `POST_CONTENT`.

Optional env vars:

- `GOOGLE_SHEET_TAB_NAME`
- `GOOGLE_SHEET_WRITE_TAB_NAME`
- `GOOGLE_SHEET_RANGE`
- `OPENAI_API_KEY` enables AI context planning for captions; without it, captions use the local deterministic planner.
- `OPENAI_CAPTION_MODEL` overrides the caption-planning model, defaulting to `gpt-5-mini`.

The AI caption planner only chooses source excerpts and a CTA teaser. The browser caption builder assembles the final caption and rejects body text containing words that are not in the pasted story, except allowed pronoun substitutions.

When a row is checked as `Posted`, the app writes `TRUE` back to the sheet's `Already Posted?` column if present, otherwise it falls back to `Posted?`, and removes the row from the active queue.
