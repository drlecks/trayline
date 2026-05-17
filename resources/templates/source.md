# Source Instructions

_Write your fetch instructions here. The AI will run these on every scheduled tick and return a JSON array of items._

## Output format

Return a JSON array. Every object must include a unique identifier field for deduplication (the field name is configured in the step's Dedup Key setting).

Example:
```json
[
  { "id": "item-123", "title": "Example item", "url": "https://example.com/item-123" }
]
```

If there is nothing to fetch, return an empty array `[]` — never return an error or prose.

## What to fetch

_Describe here: what data to retrieve, from which source or API, what fields to include, and any filtering or sorting criteria._

## Tips

- Be specific about the JSON field names so the worker that processes the cards knows what to expect.
- Keep the output focused — only include fields the downstream workers actually need.
