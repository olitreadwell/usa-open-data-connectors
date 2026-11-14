/**
 * Versioned prompt definitions.
 *
 * A prompt is code with a release history. Naming it, versioning it, and
 * hashing its instructions means a log line can say which prompt produced an
 * answer, an eval run can pin the prompt it graded, and a change to either is
 * a visible diff rather than an edit buried in a route handler.
 */

import { createHash } from 'node:crypto';

/** A prompt before its hash is computed. */
export interface AiPromptSpec<TInput> {
  /** Stable identifier, e.g. "nz-dataset-summary". */
  id: string;
  /** Bump on any change to `system` or to the rendered shape. */
  version: string;
  /** Instructions that sit in the system turn. */
  system: string;
  /**
   * Turn one typed input into the user message.
   *
   * @param input - Typed values the prompt needs
   * @returns The user message text
   */
  render(input: TInput): string;
}

/** A prompt with its content fingerprint attached. */
export interface AiPrompt<TInput> extends AiPromptSpec<TInput> {
  /** Short sha256 over `id`, `version`, and `system`. */
  hash: string;
}

/**
 * Fingerprint a prompt's identity and instructions.
 *
 * The rendered user message is deliberately excluded: it varies per call,
 * while the fingerprint is meant to identify the published prompt.
 *
 * @param spec - Prompt identity and instructions
 * @returns Twelve hex characters of sha256
 */
export function fingerprintAiPrompt(
  spec: Pick<AiPromptSpec<unknown>, 'id' | 'version' | 'system'>
): string {
  return createHash('sha256')
    .update(`${spec.id}@${spec.version}\n${spec.system}`)
    .digest('hex')
    .slice(0, 12);
}

/**
 * Register a prompt, computing its fingerprint.
 *
 * @param spec - Prompt identity, instructions, and input renderer
 * @returns The same prompt with a `hash` field
 */
export function defineAiPrompt<TInput>(spec: AiPromptSpec<TInput>): AiPrompt<TInput> {
  return { ...spec, hash: fingerprintAiPrompt(spec) };
}
