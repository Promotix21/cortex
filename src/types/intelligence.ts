export type ConfidenceLevel = 'verified' | 'probable' | 'unverified' | 'deprecated';
export type IntelligenceScope = 'project' | 'reusable';

export interface Pattern {
  id: string;
  title: string;
  description: string;
  code: string;
  tags: string[];
  source_project_id: string | null;
  scope: IntelligenceScope;
  confidence: ConfidenceLevel;
  usage_count: number;
  user_rating: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePatternInput {
  title: string;
  description?: string;
  code?: string;
  tags?: string[];
  source_project_id?: string;
  scope?: IntelligenceScope;
}

export interface DebugEntry {
  id: string;
  problem: string;
  root_cause: string;
  solution: string;
  tags: string[];
  source_project_id: string | null;
  scope: IntelligenceScope;
  confidence: ConfidenceLevel;
  usage_count: number;
  user_rating: number | null;
  error_signature: string | null;
  last_used: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDebugInput {
  problem: string;
  root_cause?: string;
  solution?: string;
  tags?: string[];
  source_project_id?: string;
  scope?: IntelligenceScope;
  error_signature?: string;
}

export interface LearningQueueItem {
  id: string;
  type: 'pattern' | 'debug';
  title?: string;
  problem?: string;
  solution?: string;
  code?: string;
  confidence: ConfidenceLevel;
  created_at: string;
}

export interface BrainData {
  [key: string]: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface GlobalSearchResults {
  projects: Project[];
  brains: BrainData[];
  sessions: Session[];
  patterns: Pattern[];
  debug: DebugEntry[];
}

// Forward reference
import type { Project } from './project';
import type { Session } from './session';
