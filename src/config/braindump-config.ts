import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import { PromptConfig, DEFAULT_PROMPT_CONFIG } from './prompt-defaults.js';

export interface ProjectConfig {
  workspaceContext: string;
  prompts: PromptConfig;
}

interface ProjectYaml {
  workspaceContext?: string;
  prompts?: {
    clarification?: {
      systemRole?: string;
      instructions?: string;
      maxQuestions?: number;
    };
    plan?: {
      systemRole?: string;
      instructions?: string;
      outputRules?: string;
    };
    intent?: {
      systemRole?: string;
    };
  };
}

/**
 * Read .braindump YAML config from the workspace root.
 * Returns project-level config (workspaceContext + prompt overrides).
 * Always returns a valid ProjectConfig — defaults when no file exists.
 */
export async function readProjectConfig(workspaceRoot: vscode.Uri): Promise<ProjectConfig> {
  const configUri = vscode.Uri.joinPath(workspaceRoot, '.braindump');

  try {
    const bytes = await vscode.workspace.fs.readFile(configUri);
    const text = new TextDecoder().decode(bytes);
    const parsed = yaml.load(text) as ProjectYaml | null;

    if (!parsed || typeof parsed !== 'object') {
      return { workspaceContext: '', prompts: DEFAULT_PROMPT_CONFIG };
    }

    const workspaceContext = typeof parsed.workspaceContext === 'string'
      ? parsed.workspaceContext
      : '';

    let prompts: PromptConfig = DEFAULT_PROMPT_CONFIG;

    if (parsed.prompts && typeof parsed.prompts === 'object') {
      const p = parsed.prompts;
      const partial: Partial<PromptConfig> = {};

      if (p.clarification && typeof p.clarification === 'object') {
        partial.clarification = {
          systemRole: typeof p.clarification.systemRole === 'string'
            ? p.clarification.systemRole
            : DEFAULT_PROMPT_CONFIG.clarification.systemRole,
          instructions: typeof p.clarification.instructions === 'string'
            ? p.clarification.instructions
            : DEFAULT_PROMPT_CONFIG.clarification.instructions,
          maxQuestions: typeof p.clarification.maxQuestions === 'number'
            ? p.clarification.maxQuestions
            : DEFAULT_PROMPT_CONFIG.clarification.maxQuestions,
        };
      }

      if (p.plan && typeof p.plan === 'object') {
        partial.plan = {
          systemRole: typeof p.plan.systemRole === 'string'
            ? p.plan.systemRole
            : DEFAULT_PROMPT_CONFIG.plan.systemRole,
          instructions: typeof p.plan.instructions === 'string'
            ? p.plan.instructions
            : DEFAULT_PROMPT_CONFIG.plan.instructions,
          outputRules: typeof p.plan.outputRules === 'string'
            ? p.plan.outputRules
            : DEFAULT_PROMPT_CONFIG.plan.outputRules,
        };
      }

      if (p.intent && typeof p.intent === 'object') {
        partial.intent = {
          systemRole: typeof p.intent.systemRole === 'string'
            ? p.intent.systemRole
            : DEFAULT_PROMPT_CONFIG.intent.systemRole,
        };
      }

      if (Object.keys(partial).length > 0) {
        prompts = {
          clarification: partial.clarification ?? DEFAULT_PROMPT_CONFIG.clarification,
          plan: partial.plan ?? DEFAULT_PROMPT_CONFIG.plan,
          intent: partial.intent ?? DEFAULT_PROMPT_CONFIG.intent,
        };
      }
    }

    return { workspaceContext, prompts };
  } catch {
    // File doesn't exist or is invalid YAML — use defaults
    return { workspaceContext: '', prompts: DEFAULT_PROMPT_CONFIG };
  }
}
