# Domain docs

How the engineering skills should read this repo's domain documentation.

## Layout

Single-context repo. One `CONTEXT.md` at the root and one `docs/adr/` folder,
if they exist.

```
/
├── CONTEXT.md        # glossary and the concepts this repo owns
├── docs/adr/         # decisions, numbered and dated
└── src/
```

## Before exploring, read these

- `CONTEXT.md` at the repo root.
- `docs/adr/` entries that touch the area being changed.
- For AI work, `docs/ai.md` is the contract for the seam, and
  `src/lib/ai/` is where its vocabulary is defined.

If these files do not exist, proceed silently. Do not flag their absence and
do not propose creating them up front; they are written when a term or a
decision is actually settled.

## Use the glossary's vocabulary

When output names a domain concept, use the term as `CONTEXT.md` defines it.
The AI seam has its own terms and they are not interchangeable: a *prompt* is
a versioned definition, a *completion* is one call's result, an *eval* is a
case that grades a completion, and a *judge* is a model grading one.

## Flag ADR conflicts

If a change contradicts an existing ADR, say so instead of overriding it
quietly: "Contradicts ADR-0004 (no vendor SDK), but worth reopening because".
