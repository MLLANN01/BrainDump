import * as vscode from 'vscode';
import { AIBackend, BrainDumpRequest, BrainDumpPlan, ClarificationResult, StreamCallback } from './types.js';
import { buildPrompt, buildIntentPrompt, buildClarificationPrompt } from '../processing/prompt.js';
import { parseResponse, parseIntentResponse, parseClarificationResponse } from '../processing/parser.js';
import { DEFAULT_PROMPT_CONFIG } from '../config/prompt-defaults.js';

export class VSCodeLMBackend implements AIBackend {
  readonly name: string;
  private model: vscode.LanguageModelChat;

  constructor(models: vscode.LanguageModelChat[]) {
    this.model = models[0];
    this.name = `vscode.lm (${this.model.name})`;
  }

  async process(
    request: BrainDumpRequest,
    token: vscode.CancellationToken,
    onChunk?: StreamCallback,
  ): Promise<BrainDumpPlan> {
    const promptConfig = request.promptConfig ?? DEFAULT_PROMPT_CONFIG;

    // Two-pass: first determine which files need to be read for edits
    const fileContents = await this.intentPass(request, token);

    // Build the full prompt with file contents (if any)
    const promptText = buildPrompt(request, promptConfig, fileContents);
    const messages = [
      vscode.LanguageModelChatMessage.User(promptText),
    ];

    const response = await this.model.sendRequest(messages, {}, token);

    let responseText = '';
    for await (const chunk of response.text) {
      responseText += chunk;
      if (onChunk) {
        onChunk(chunk);
      }
    }

    return parseResponse(responseText);
  }

  async clarify(
    request: BrainDumpRequest,
    token: vscode.CancellationToken,
    onChunk?: StreamCallback,
  ): Promise<ClarificationResult> {
    const promptConfig = request.promptConfig ?? DEFAULT_PROMPT_CONFIG;
    const promptText = buildClarificationPrompt(request, promptConfig);
    const messages = [
      vscode.LanguageModelChatMessage.User(promptText),
    ];

    const response = await this.model.sendRequest(messages, {}, token);

    let responseText = '';
    for await (const chunk of response.text) {
      responseText += chunk;
      if (onChunk) {
        onChunk(chunk);
      }
    }

    return parseClarificationResponse(responseText);
  }

  /**
   * Intent pass: ask the AI which existing files it needs to read.
   * Returns a map of filePath -> fileContent for files that exist.
   */
  private async intentPass(
    request: BrainDumpRequest,
    token: vscode.CancellationToken,
  ): Promise<Map<string, string>> {
    const fileContents = new Map<string, string>();

    try {
      const promptConfig = request.promptConfig ?? DEFAULT_PROMPT_CONFIG;
      const intentPrompt = buildIntentPrompt(request, promptConfig);
      const messages = [
        vscode.LanguageModelChatMessage.User(intentPrompt),
      ];

      const response = await this.model.sendRequest(messages, {}, token);

      let responseText = '';
      for await (const chunk of response.text) {
        responseText += chunk;
      }

      const intent = parseIntentResponse(responseText);

      if (intent.filesToRead.length === 0) {
        return fileContents;
      }

      // Read each requested file
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return fileContents;
      }

      const workspaceRoot = workspaceFolders[0].uri;
      for (const filePath of intent.filesToRead.slice(0, 10)) { // Cap at 10 files
        try {
          const fileUri = vscode.Uri.joinPath(workspaceRoot, filePath);
          const doc = await vscode.workspace.openTextDocument(fileUri);
          const text = doc.getText();
          // Cap file content at 10K characters
          fileContents.set(filePath, text.length > 10000 ? text.slice(0, 10000) + '\n... (truncated)' : text);
        } catch {
          // File doesn't exist or can't be read, skip
        }
      }
    } catch {
      // Intent pass failed — fall back to single-pass without file contents
    }

    return fileContents;
  }
}
