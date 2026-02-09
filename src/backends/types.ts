import * as vscode from 'vscode';
import { PromptConfig } from '../config/prompt-defaults.js';

export type StreamCallback = (chunk: string) => void;

export interface AIBackend {
  readonly name: string;
  process(request: BrainDumpRequest, token: vscode.CancellationToken, onChunk?: StreamCallback): Promise<BrainDumpPlan>;
  clarify?(request: BrainDumpRequest, token: vscode.CancellationToken, onChunk?: StreamCallback): Promise<ClarificationResult>;
}

export interface BrainDumpRequest {
  rawText: string;
  workspaceContext: string;
  fileTree: string;
  clarificationAnswers?: ClarificationAnswer[];
  promptConfig?: PromptConfig;
}

export interface ClarificationResult {
  clarifications: ClarificationQuestion[];
  suggestions: SuggestionNote[];
}

export interface BrainDumpPlan {
  summary: string;
  fileOperations: FileOperation[];
  actionItems: ActionItem[];
  suggestions?: SuggestionNote[];
}

export interface FileOperation {
  action: 'create' | 'append' | 'edit';
  filePath: string;
  description: string;
  content: string;
  searchBlock?: string; // Required for 'edit' — the text to find and replace
}

export interface ActionItem {
  description: string;
  priority?: 'high' | 'medium' | 'low';
  relatedFiles?: string[];
  targetFile?: string;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  suggestedOptions?: string[];
  context?: string;
}

export interface SuggestionNote {
  type: 'interpretation' | 'recommendation' | 'warning';
  message: string;
  relatedFiles?: string[];
}

export interface ClarificationAnswer {
  questionId: string;
  answer: string;
}
