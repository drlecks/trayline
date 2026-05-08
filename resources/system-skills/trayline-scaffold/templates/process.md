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
