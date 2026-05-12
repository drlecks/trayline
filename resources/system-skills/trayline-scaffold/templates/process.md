# Worker Instructions

You are processing a card in the workflow.

## Input

The card you are processing is provided as JSON:

```
{{card.data}}
```

## What to do

(Replace this section with specific instructions for what this worker should do.)

## Output

Reply with a single JSON object describing the result. Do not include any prose.

```json
{
  "summary": "<one-line summary>",
  "fields": {
    "<field_id>": "<value>"
  }
}
```

## If you cannot complete the task

If the input is missing, the request is impossible, or you cannot produce a confident result, return the failure envelope defined by the **Trayline Worker Output Contract** instead:

```json
{
  "trayline_error": {
    "code": "<short_snake_case>",
    "message": "<one-line human-readable explanation>"
  }
}
```

Trayline will send the source card to the error tray (`99-errors`) with this message. Do **not** invent placeholder output to "succeed" — prefer `trayline_error` when in doubt.
