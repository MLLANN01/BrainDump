import * as vscode from 'vscode';
import { AIBackend } from './types.js';
import { VSCodeLMBackend } from './vscode-lm.js';

export async function detectBackend(preferredModel?: string): Promise<AIBackend | null> {
  // Gather all available models
  let allModels: vscode.LanguageModelChat[] = [];

  // 1. Try Copilot models
  try {
    const copilotModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    allModels.push(...copilotModels);
  } catch {
    // Copilot not available
  }

  // 2. Try any other LM providers (BYOK, third-party, Ollama, etc.)
  try {
    const anyModels = await vscode.lm.selectChatModels({});
    for (const model of anyModels) {
      if (!allModels.some((m) => m.id === model.id)) {
        allModels.push(model);
      }
    }
  } catch {
    // No LM providers available
  }

  if (allModels.length === 0) {
    return null;
  }

  // If a preferred model is set, move it to the front
  if (preferredModel) {
    const idx = allModels.findIndex((m) => m.id === preferredModel);
    if (idx > 0) {
      const [match] = allModels.splice(idx, 1);
      allModels.unshift(match);
    }
  }

  return new VSCodeLMBackend(allModels);
}

/**
 * List all available models for the model picker.
 */
export async function listAvailableModels(): Promise<vscode.LanguageModelChat[]> {
  const seen = new Set<string>();
  const models: vscode.LanguageModelChat[] = [];

  try {
    for (const m of await vscode.lm.selectChatModels({ vendor: 'copilot' })) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        models.push(m);
      }
    }
  } catch {
    // Copilot not available
  }

  try {
    for (const m of await vscode.lm.selectChatModels({})) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        models.push(m);
      }
    }
  } catch {
    // No providers
  }

  return models;
}
