import express, { Request, Response } from 'express';
import { applyFixToGitHub } from './github-file.js';
import { ApplyRequest, ApplyResponse } from './types.js';
import { callLLM } from './llm-router.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? '8080';

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', bot: 'openclaw-coder', version: '1.1.0' });
});

app.post('/apply', async (req: Request, res: Response) => {
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

  try {
    const { branch, commitSha } = await applyFixToGitHub(fix);

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
  console.log('[Coder] Boot confirmed — openclaw-coder v1.1.0');
  console.log('[Coder] LLM router loaded — task: code_generation');
  console.log(`[Coder] Health server on port ${PORT}`);
});

void callLLM;
