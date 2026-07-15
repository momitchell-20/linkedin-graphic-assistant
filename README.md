# LinkedIn Graphics Bot

Standalone local app for composing LinkedIn graphics in the Business Insider style.

## What it does

- Preserves the source photo and only crops or resizes as needed.
- Adds a white BI logo near the top center.
- Renders a headline at the bottom with a dark fade for readability.
- Exports a 4:5 PNG suitable for LinkedIn.

## Notes

- The logo is drawn in-browser, so there are no external asset dependencies.
- The app uses system fonts by default, which keeps the project fully self-contained.
- This is a plain frontend project so it can be deployed to Vercel later without a ChatGPT site.
