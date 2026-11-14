import { describe, expect, it } from 'vitest';
import { defineAiPrompt, fingerprintAiPrompt } from './aiPrompt';

describe('defineAiPrompt', () => {
  const base = {
    id: 'nz-dataset-summary',
    version: '1',
    system: 'You summarise New Zealand public datasets.',
    render: (input: { title: string }) => `Summarise: ${input.title}`,
  };

  it('attaches a twelve character hex fingerprint', () => {
    const prompt = defineAiPrompt(base);
    expect(prompt.hash).toMatch(/^[0-9a-f]{12}$/);
    expect(prompt.render({ title: 'Sheep' })).toBe('Summarise: Sheep');
  });

  it('is stable for the same identity and instructions', () => {
    expect(defineAiPrompt(base).hash).toBe(defineAiPrompt(base).hash);
  });

  it('changes when the version or the instructions change', () => {
    const original = fingerprintAiPrompt(base);
    expect(fingerprintAiPrompt({ ...base, version: '2' })).not.toBe(original);
    expect(fingerprintAiPrompt({ ...base, system: `${base.system} Be terse.` })).not.toBe(original);
  });
});
