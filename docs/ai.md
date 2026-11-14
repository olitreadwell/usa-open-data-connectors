# AI features

The template ships an AI seam, so a new repo does not have to invent one. It
is an OpenAI-compatible client plus the four things every model call needs
around it: a cost cap, a redaction pass, an output contract, and an eval.

Nothing here is enabled by default. With no `AI_API_KEY` in the environment,
`isAiConfigured()` returns false, `pnpm run check` stays green, and the app
keeps working. A feature added on top of this seam is opt-in by construction.

## What is in the box

| Path | What it does |
| --- | --- |
| `src/lib/ai/aiConfig.ts` | Reads `AI_*` from the environment; throws when the key is missing |
| `src/lib/ai/aiClient.ts` | `generateText`, `generateObject`, `streamText` over `POST {baseUrl}/chat/completions` |
| `src/lib/ai/aiUsage.ts` | Turns token counts into an estimated cost, and keeps a ledger |
| `src/lib/ai/aiGuard.ts` | Redacts personal data, fences untrusted text, finds injection signals, enforces the cost cap |
| `src/lib/ai/aiPrompt.ts` | Names and versions a prompt, and fingerprints it so a log line identifies it |
| `evals/` | The prompt test suite, run with `pnpm run evals` |

Everything is dependency-free beyond `zod`, which the template already uses.
The client speaks the chat-completions shape that OpenAI, Ollama, vLLM,
OpenRouter, Groq and most gateways implement, so changing provider is a
change to `AI_BASE_URL` and `AI_MODEL`, not a change to your code.

## The four rules

1. **Off by default.** A missing key disables the feature. A model call is
   never on the critical path of a page that could render without it.
2. **Cost is measured, not discovered.** Every call goes through the ledger
   and is refused when its estimate is over `AI_MAX_COST_USD_PER_REQUEST`.
3. **Guardrails sit at the boundary.** Third-party text is fenced before it
   reaches a model, and obvious personal data is redacted on the way out.
4. **A prompt change ships with an eval.** If you change the instructions,
   `pnpm run evals` has to still pass, or the change is a regression.

## Adding an AI feature

1. Define the prompt in `src/lib/ai/aiPrompt.ts` style, with an id and a
   version. Keep prompts in `src/server/`, out of route files, so the
   fingerprint has something stable to hash.
2. Wrap third-party text with `fenceUntrustedContent(label, text)`, and run
   `findPromptInjectionSignals(text)` over it. Log the signals; do not trust
   the text.
3. Call `createAiClient()` and use `generateObject` with a `zod` schema when
   the answer feeds the app. `generateText` is for prose a human reads.
4. Log the completion's `promptHash`, `usage`, and `cost.usd` with the
   existing pino logger, so a bill spike has a cause.
5. Add a case to `evals/cases/`. If the answer is subjective, add a `judge`
   rubric as well and run `pnpm run evals -- --with-judge`.
6. Return a typed error, not a stack. `toErrorResponse()` in
   `src/lib/errors.ts` already maps `AiCallError` and `AiBudgetError` when
   you throw them from a route.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `AI_API_KEY` | unset | Presence of this turns the seam on |
| `AI_BASE_URL` | `https://ollama.com/v1` | Any OpenAI-compatible base URL |
| `AI_MODEL` | `gpt-oss:120b` | Passed straight to the provider |
| `AI_TIMEOUT_MS` | `30000` | Wall clock per call |
| `AI_MAX_OUTPUT_TOKENS` | `1024` | Ceiling per call |
| `AI_MAX_COST_USD_PER_REQUEST` | `0.25` | Calls estimated above this throw |
| `AI_TEMPERATURE` | `0.2` | Sampling temperature, `0` is allowed |

Costs come from a small price table in `src/lib/ai/aiUsage.ts`. A model that
is not in the table is reported as `priced: false` rather than as free, so an
unknown model shows up as unpriced in the ledger instead of silently zero.

## What is deliberately not here

- No vendor SDK. A template that ships one picks a winner for every project
  built from it.
- No agent framework. A loop over tools is thirty lines; a framework is a
  dependency that outlives the reason it was added.
- No vector store. Retrieval belongs to the project that has documents, and
  the template has none.
- No hosted eval service. `evals/run-evals.mjs` writes a JSON report you can
  commit, diff, and read in CI without an account.
