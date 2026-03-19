import { FixSuggestion } from './types.js';

export interface ApplyResult {
  ok: true;
  content: string;
}

export interface ApplyFailure {
  ok: false;
  reason: string;
}

export function applyFix(
  fileContent: string,
  fix: FixSuggestion
): ApplyResult | ApplyFailure {
  const lines = fileContent.split('\n');
  const totalLines = lines.length;

  // Line numbers are 1-based
  const lineIndex = fix.line - 1;

  if (fix.action === 'delete_line') {
    if (lineIndex < 0 || lineIndex >= totalLines) {
      return {
        ok: false,
        reason: `Line ${fix.line} does not exist — file has ${totalLines} lines`,
      };
    }
    lines.splice(lineIndex, 1);
    return { ok: true, content: lines.join('\n') };
  }

  if (fix.action === 'replace_line') {
    if (lineIndex < 0 || lineIndex >= totalLines) {
      return {
        ok: false,
        reason: `Line ${fix.line} does not exist — file has ${totalLines} lines`,
      };
    }
    lines[lineIndex] = fix.newContent;
    return { ok: true, content: lines.join('\n') };
  }

  if (fix.action === 'insert_after') {
    if (lineIndex < 0 || lineIndex >= totalLines) {
      return {
        ok: false,
        reason: `Line ${fix.line} does not exist — file has ${totalLines} lines`,
      };
    }
    lines.splice(lineIndex + 1, 0, fix.newContent);
    return { ok: true, content: lines.join('\n') };
  }

  return { ok: false, reason: `Unknown action: ${String(fix.action)}` };
}
