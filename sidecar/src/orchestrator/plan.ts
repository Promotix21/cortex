/**
 * Plan / Reflect — v2.5 heuristic pre-analysis.
 *
 * Note: This does NOT make a second LLM call. It analyzes the prompt locally
 * to produce a structured plan that's useful for the Shadow Terminal and
 * Impact Graph gating. A future v2.6+ can replace this with a true planning
 * LLM call if the heuristic proves insufficient.
 */

export type Intent = 'question' | 'read' | 'edit' | 'create' | 'refactor' | 'debug' | 'other';

export interface Plan {
  runId: string;
  intent: Intent;
  writeIntent: boolean;
  mentionedFiles: string[];
  mentionedSymbols: string[];
  summary: string;
}

export interface Reflection {
  runId: string;
  outcome: 'success' | 'error' | 'aborted' | 'partial';
  chunkCount: number;
  totalChars: number;
  errorMessage?: string;
  summary: string;
}

const EDIT_VERBS = /\b(refactor|rename|rewrite|replace|modify|change|update|fix|patch|add|remove|delete|implement|wire|integrate|extract|inline)\b/i;
const CREATE_VERBS = /\b(create|generate|scaffold|new file|add file|make a)\b/i;
const QUESTION_STARTS = /^(what|why|how|does|is|are|can|could|would|should|where|when|which|explain|describe)\b/i;
const DEBUG_TERMS = /\b(bug|error|crash|broken|failing|stack trace|exception|issue)\b/i;
const READ_VERBS = /\b(show|list|find|search|look at|read|print|grep)\b/i;

const FILE_PATTERN = /\b([\w./@-]+\.(ts|tsx|js|jsx|rs|py|go|java|cpp|c|h|css|scss|html|md|json|toml|yaml|yml|sh|rb|php))\b/g;
const SYMBOL_PATTERN = /\b([A-Z][A-Za-z0-9]{2,}|[a-z][a-zA-Z0-9]{2,}(?=\s*\())/g;

export function analyzePrompt(prompt: string, runId: string): Plan {
  const trimmed = prompt.trim();
  let intent: Intent = 'other';

  if (QUESTION_STARTS.test(trimmed)) intent = 'question';
  else if (CREATE_VERBS.test(trimmed)) intent = 'create';
  else if (EDIT_VERBS.test(trimmed)) intent = 'edit';
  else if (DEBUG_TERMS.test(trimmed)) intent = 'debug';
  else if (READ_VERBS.test(trimmed)) intent = 'read';

  if (/\brefactor\b/i.test(trimmed)) intent = 'refactor';

  const writeIntent = intent === 'edit' || intent === 'create' || intent === 'refactor';

  const mentionedFiles = Array.from(new Set(
    Array.from(prompt.matchAll(FILE_PATTERN)).map(m => m[1])
  ));

  const mentionedSymbols = Array.from(new Set(
    Array.from(prompt.matchAll(SYMBOL_PATTERN))
      .map(m => m[1])
      .filter(s => !/^(The|This|That|What|Why|How|When|Where|With|Not|And|But|For|Can|Could|Would|Should|Have|Had|Is|Are|Was|Were|Will|Does|Did)$/i.test(s))
  )).slice(0, 20);

  const summary = buildPlanSummary(intent, writeIntent, mentionedFiles, mentionedSymbols);

  return { runId, intent, writeIntent, mentionedFiles, mentionedSymbols, summary };
}

function buildPlanSummary(intent: Intent, writeIntent: boolean, files: string[], symbols: string[]): string {
  const parts: string[] = [];
  parts.push(`Intent: ${intent}${writeIntent ? ' (write)' : ' (read-only)'}`);
  if (files.length > 0) parts.push(`Files: ${files.slice(0, 5).join(', ')}${files.length > 5 ? ` +${files.length - 5}` : ''}`);
  if (symbols.length > 0) parts.push(`Symbols: ${symbols.slice(0, 5).join(', ')}`);
  return parts.join(' · ');
}

export function buildReflection(
  runId: string,
  outcome: Reflection['outcome'],
  chunkCount: number,
  totalChars: number,
  errorMessage?: string
): Reflection {
  let summary: string;
  switch (outcome) {
    case 'success':
      summary = `Completed — ${chunkCount} chunks, ${totalChars} chars`;
      break;
    case 'error':
      summary = `Failed: ${errorMessage || 'unknown error'}`;
      break;
    case 'aborted':
      summary = `Aborted before completion`;
      break;
    case 'partial':
      summary = `Partial — ${chunkCount} chunks streamed before stop`;
      break;
  }
  return { runId, outcome, chunkCount, totalChars, errorMessage, summary };
}
