# Summarize & Tag

You will receive a customer feedback card. Your job is to:

1. Write a **one-sentence summary** of the feedback (max 25 words, plain language, no jargon).
2. Assign a **sentiment tag**: choose exactly one of `positive`, `neutral`, or `negative`.

## Output format

Add two fields to the card JSON:

- `summary` — your one-sentence summary
- `sentiment` — one of: `positive`, `neutral`, `negative`

Keep the original card fields intact. Only add `summary` and `sentiment`.

## Examples

**Input card:**
```json
{
  "source": "App Store review",
  "feedback_text": "The app crashes every time I try to export a PDF. Very frustrating."
}
```

**Output card:**
```json
{
  "source": "App Store review",
  "feedback_text": "The app crashes every time I try to export a PDF. Very frustrating.",
  "summary": "User reports repeated crashes when exporting PDFs.",
  "sentiment": "negative"
}
```
