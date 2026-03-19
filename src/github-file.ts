import { Octokit } from '@octokit/rest';
import { FixSuggestion } from './types.js';
import { applyFix } from './apply-fix.js';

const owner = process.env.GITHUB_OWNER ?? '';
const repo = process.env.GITHUB_REPO ?? '';
const pat = process.env.GITHUB_PAT ?? '';

const octokit = new Octokit({ auth: pat });

console.log(`[INFO] github-file loaded for ${owner}/${repo}`);

async function withRateLimitRetry<T>(fn: () => Promise<T>, attempt = 1): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    if (e.message.includes('403') && attempt <= 3) {
      const delay = attempt * 2000;
      console.warn(`[WARN] Rate limit hit — retrying in ${delay}ms (attempt ${attempt}/3)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRateLimitRetry(fn, attempt + 1);
    }
    throw e;
  }
}

export async function applyFixToGitHub(fix: FixSuggestion): Promise<{
  branch: string;
  commitSha: string;
}> {
  // Step 1 — Get current main branch SHA
  console.log('[Coder] Fetching main branch SHA...');
  const mainRef = await withRateLimitRetry(() =>
    octokit.git.getRef({ owner, repo, ref: 'heads/main' })
  );
  const mainSha = mainRef.data.object.sha;
  console.log(`[Coder] Main SHA: ${mainSha}`);

  // Step 2 — Fetch target file content
  console.log(`[Coder] Fetching file: ${fix.file}`);
  let fileSha: string;
  let fileContent: string;

  try {
    const fileResponse = await withRateLimitRetry(() =>
      octokit.repos.getContent({ owner, repo, path: fix.file })
    );

    const fileData = fileResponse.data;
    if (Array.isArray(fileData) || fileData.type !== 'file') {
      throw new Error(`Path ${fix.file} is not a file`);
    }

    fileSha = fileData.sha;
    fileContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
    console.log(`[Coder] File fetched — ${fileContent.split('\n').length} lines`);

  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    if (e.message.includes('404')) {
      throw new Error(`Target file not found in GitHub: ${fix.file}`);
    }
    throw e;
  }

  // Step 3 — Apply the fix
  console.log(`[Coder] Applying fix: ${fix.action} on line ${fix.line}`);
  const result = applyFix(fileContent, fix);

  if (!result.ok) {
    throw new Error(result.reason);
  }

  console.log('[Coder] Fix applied successfully');

  // Step 4 — Create fix branch
  const branch = `fix/auto-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  console.log(`[Coder] Creating branch: ${branch}`);

  await withRateLimitRetry(() =>
    octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha: mainSha,
    })
  );

  // Step 5 — Commit the real changed file
  console.log('[Coder] Committing real file change...');
  const commitResponse = await withRateLimitRetry(() =>
    octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: fix.file,
      message: `fix: ${fix.description}`,
      content: Buffer.from(result.content, 'utf-8').toString('base64'),
      sha: fileSha,
      branch,
    })
  );

  const commitSha = commitResponse.data.commit.sha ?? '';
  console.log(`[Coder] Committed SHA: ${commitSha}`);

  return { branch, commitSha };
}
