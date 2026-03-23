import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
dotenv.config();

import { applyFixToGitHub } from './github-file.js';
import { ApplyRequest, ApplyResponse } from './types.js';
import { callLLM } from './llm-router.js';
import { CODER_CONSTITUTION } from './coder-constitution.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? '8080';
const BOT_VERSION = '1.2.0';

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', bot: 'openclaw-coder', version: BOT_VERSION });
});

app.post('/apply', async (req: Request, res: Response): Promise<void> => {
  console.log('[Coder] Received /apply request');

  const body = req.body as Partial<ApplyRequest>;

  if (!body.fix || typeof body.fix !== 'object') {
    const response: ApplyResponse = {
      status: 'error',
      reason: 'Missing or invalid field: fix',
    };
    res.status(400).json(response);
    return;
  }

  const fix = body.fix;

  if (typeof fix.file !== 'string' || !fix.file.startsWith('src/') || !fix.file.endsWith('.ts')) {
    const response: ApplyResponse = {
      status: 'error',
      reason: `Invalid file path: ${String(fix.file)}`,
    };
    res.status(400).json(response);
    return;
  }

  if (typeof fix.line !== 'number' || !Number.isInteger(fix.line) || fix.line < 1) {
    const response: ApplyResponse = {
      status: 'error',
      reason: `Invalid line number: ${String(fix.line)}`,
    };
    res.status(400).json(response);
    return;
  }

  if (!['delete_line', 'replace_line', 'insert_after'].includes(fix.action)) {
    const response: ApplyResponse = {
      status: 'error',
      reason: `Invalid action: ${String(fix.action)}`,
    };
    res.status(400).json(response);
    return;
  }

  // Log constitution context for observability
  console.log(`[Coder] Constitution loaded — ${CODER_CONSTITUTION.length} chars`);
  console.log(`[Coder] Applying fix — file: ${fix.file} line: ${fix.line} action: ${fix.action}`);
  console.log(`[Coder] Description: ${fix.description}`);

  // Generate enhanced description via LLM before applying
  // This gives the commit message more context
  let enhancedDescription = fix.description;
  try {
    const llmResponse = await callLLM({
      task: 'code_generation',
      prompt: `${CODER_CONSTITUTION}

A fix is about to be applied to the OpenClaw codebase.

Fix details:
- File: ${fix.file}
- Line: ${fix.line}
- Action: ${fix.action}
- New content: ${fix.newContent}
- Description: ${fix.description}

Write a single concise git commit message for this change.
Format: "fix: <what was wrong and how it was fixed>"
Maximum 72 characters. No preamble. Just the commit message.`,
      systemPrompt: 'You write concise git commit messages. One line only. Start with "fix: ". Maximum 72 characters.',
      maxTokens: 80,
    });

    const cleaned = llmResponse.text
      .replace(/^```.*\n?/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    if (cleaned.length > 0 && cleaned.length <= 100) {
      enhancedDescription = cleaned;
      console.log(`[Coder] LLM commit message: ${enhancedDescription}`);
    } else {
      console.log(`[Coder] LLM message too long or empty — using original description`);
    }
  } catch (llmErr: unknown) {
    const e = llmErr instanceof Error ? llmErr : new Error(String(llmErr));
    console.warn(`[Coder] LLM commit message failed — using original: ${e.message}`);
  }

  try {
    const { branch, commitSha } = await applyFixToGitHub({
      ...fix,
      description: enhancedDescription,
    });

    const response: ApplyResponse = {
      status: 'ok',
      branch,
      commitSha,
      message: 'Real file edit committed',
    };

    console.log(`[Coder] Success — branch: ${branch}, commit: ${commitSha}`);
    res.status(200).json(response);

  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(`[Coder] Failed: ${e.message}`);

    const response: ApplyResponse = {
      status: 'error',
      reason: e.message,
    };
    res.status(500).json(response);
  }
});

app.listen(parseInt(PORT), '0.0.0.0', () => {
  console.log(`[Coder] Boot confirmed — openclaw-coder v${BOT_VERSION}`);
  console.log(`[Coder] LLM router loaded — task: code_generation`);
  console.log(`[Coder] Constitution loaded — ${CODER_CONSTITUTION.length} chars`);
  console.log(`[Coder] Health server on port ${PORT}`);
});
