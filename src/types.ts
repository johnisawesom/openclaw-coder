export interface FixSuggestion {
  file: string;
  line: number;
  action: 'delete_line' | 'replace_line' | 'insert_after';
  newContent: string;
  description: string;
}

export interface ApplyRequest {
  fix: FixSuggestion;
}

export interface ApplySuccess {
  status: 'ok';
  branch: string;
  commitSha: string;
  message: string;
}

export interface ApplyError {
  status: 'error';
  reason: string;
}

export type ApplyResponse = ApplySuccess | ApplyError;
