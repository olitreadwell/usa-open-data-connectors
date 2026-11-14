#!/usr/bin/env node
// Runs every case in evals/cases against the configured provider and grades
// the answers. Deterministic checks run by default; `--with-judge` adds a
// second model call that scores the answer against the case rubric.
//
// Usage:
//   node evals/run-evals.mjs [--case <id>] [--with-judge] [--json]
//
// Exits 0 when every case passes, 1 when one fails, and 0 with a notice when
// no provider is configured, so CI without secrets stays green.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const onlyCase = args.includes('--case') ? args[args.indexOf('--case') + 1] : null;
const withJudge = args.includes('--with-judge');
const asJson = args.includes('--json');

const REPO_ROOT = resolve(import.meta.dirname, '..');
const CASES_DIR = join(REPO_ROOT, 'evals', 'cases');
const REPORT_PATH = join(REPO_ROOT, 'evals', 'report.json');

const baseUrl = (process.env.AI_BASE_URL?.trim() || 'https://ollama.com/v1').replace(/\/+$/, '');
const model = process.env.AI_MODEL?.trim() || 'gpt-oss:120b';
const apiKey = process.env.AI_API_KEY?.trim();

/**
 * Trim a model answer to something a terminal and a diff can hold.
 *
 * @param {string} text - Raw answer
 * @param {number} limit - Longest string to keep
 * @returns {string} The answer, truncated with an ellipsis when it was longer
 */
function trimAnswer(text, limit = 600) {
  return text.length <= limit ? text : `${text.slice(0, limit)}...`;
}

/**
 * Ask the provider for one chat completion.
 *
 * @param {Array<{role: string, content: string}>} messages - Conversation to send
 * @returns {Promise<{text: string, inputTokens: number, outputTokens: number}>} The answer and its usage
 */
async function callModel(messages) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: 512, temperature: 0 }),
  });
  if (!response.ok) {
    throw new Error(`provider responded ${response.status}`);
  }
  const body = await response.json();
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('provider returned no message content');
  }
  return {
    text,
    inputTokens: body.usage?.prompt_tokens ?? 0,
    outputTokens: body.usage?.completion_tokens ?? 0,
  };
}

/**
 * Run the deterministic checks in a case's `expect` block.
 *
 * @param {string} answer - Model answer
 * @param {Record<string, unknown>} expect - Expectations from the case file
 * @returns {string[]} One message per failed check, empty when all passed
 */
function runDeterministicChecks(answer, expect = {}) {
  const failures = [];
  const lower = answer.toLowerCase();

  for (const phrase of expect.mustInclude ?? []) {
    if (!lower.includes(String(phrase).toLowerCase())) failures.push(`missing: ${phrase}`);
  }
  for (const phrase of expect.mustNotInclude ?? []) {
    if (lower.includes(String(phrase).toLowerCase())) failures.push(`must not appear: ${phrase}`);
  }
  for (const pattern of expect.mustMatch ?? []) {
    if (!new RegExp(pattern).test(answer)) failures.push(`no match: ${pattern}`);
  }
  if (typeof expect.minChars === 'number' && answer.length < expect.minChars) {
    failures.push(`shorter than ${expect.minChars} characters`);
  }
  if (typeof expect.maxChars === 'number' && answer.length > expect.maxChars) {
    failures.push(`longer than ${expect.maxChars} characters`);
  }
  return failures;
}

/**
 * Grade an answer against the case rubric with a second model call.
 *
 * @param {string} answer - Model answer under test
 * @param {{rubric: string, threshold?: number}} judge - Rubric and pass mark
 * @returns {Promise<{score: number, threshold: number, reason: string}>} The grade
 */
async function runJudge(answer, judge) {
  const threshold = judge.threshold ?? 4;
  const result = await callModel([
    {
      role: 'system',
      content: 'You grade answers. Reply with JSON only: {"score": 1-5, "reason": "one sentence"}.',
    },
    { role: 'user', content: `Rubric: ${judge.rubric}\n\nAnswer to grade:\n${answer}` },
  ]);
  const parsed = JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  return { score: Number(parsed.score), threshold, reason: String(parsed.reason ?? '') };
}

async function main() {
  if (!apiKey) {
    console.log(`evals skipped: AI_API_KEY is not set (would target ${baseUrl}, model ${model})`);
    return;
  }

  const files = (await readdir(CASES_DIR)).filter((name) => name.endsWith('.json')).sort();
  const cases = [];
  for (const file of files) {
    const id = file.replace(/\.json$/, '');
    if (onlyCase && id !== onlyCase) continue;
    cases.push({ id, ...JSON.parse(await readFile(join(CASES_DIR, file), 'utf8')) });
  }
  if (cases.length === 0) {
    console.error(onlyCase ? `no eval case named ${onlyCase}` : 'no eval cases found');
    process.exitCode = 1;
    return;
  }

  const results = [];
  for (const evalCase of cases) {
    const startedAt = Date.now();
    try {
      const messages = [
        ...(evalCase.system ? [{ role: 'system', content: evalCase.system }] : []),
        { role: 'user', content: evalCase.prompt },
      ];
      const answer = await callModel(messages);
      const failures = runDeterministicChecks(answer.text, evalCase.expect);
      let judge = null;
      if (withJudge && evalCase.judge) {
        judge = await runJudge(answer.text, evalCase.judge);
        if (!Number.isFinite(judge.score) || judge.score < judge.threshold) {
          failures.push(`judge scored ${judge.score}/${judge.threshold}: ${judge.reason}`);
        }
      }
      results.push({
        id: evalCase.id,
        passed: failures.length === 0,
        failures,
        judge,
        answer: trimAnswer(answer.text),
        inputTokens: answer.inputTokens,
        outputTokens: answer.outputTokens,
        latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      results.push({
        id: evalCase.id,
        passed: false,
        failures: [error instanceof Error ? error.message : 'unknown failure'],
        judge: null,
        answer: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - startedAt,
      });
    }
  }

  const report = {
    model,
    baseUrl,
    withJudge,
    ranAt: new Date().toISOString(),
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    totalInputTokens: results.reduce((sum, result) => sum + result.inputTokens, 0),
    totalOutputTokens: results.reduce((sum, result) => sum + result.outputTokens, 0),
    results,
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const result of results) {
      const mark = result.passed ? 'pass' : 'FAIL';
      console.log(`${mark}  ${result.id}  (${result.latencyMs}ms)`);
      for (const failure of result.failures) console.log(`      ${failure}`);
    }
    console.log(
      `\n${report.passed} passed, ${report.failed} failed, ` +
        `${report.totalInputTokens + report.totalOutputTokens} tokens, model ${model}`
    );
  }

  if (report.failed > 0) process.exitCode = 1;
}

await main();
