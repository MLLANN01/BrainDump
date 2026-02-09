import * as vscode from 'vscode';
import { detectBackend, listAvailableModels } from './backends/detect.js';
import type { AIBackend, BrainDumpPlan, ClarificationAnswer, SuggestionNote } from './backends/types.js';
import { getSettings } from './config/settings.js';
import { readProjectConfig, ProjectConfig } from './config/braindump-config.js';
import { generateFileTree } from './processing/file-tree.js';
import { ParseError } from './processing/parser.js';
import { applyOperations, undoOperations, FileSnapshot } from './operations/apply.js';
import { writeActionItems } from './operations/action-items.js';
import { postProcess } from './operations/post-process.js';
import { archiveBrainDump } from './operations/history.js';
import { createStreamingPanel, createStreamingClarificationPanel, ReviewMessage } from './ui/review-panel.js';
import { createStatusBarItem, updateStatusBarBackend } from './ui/status-bar.js';

let outputChannel: vscode.OutputChannel;
let lastSnapshots: FileSnapshot[] | null = null;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('BrainDump');

  const statusBar = createStatusBarItem();
  context.subscriptions.push(statusBar);
  context.subscriptions.push(outputChannel);

  const processCommand = vscode.commands.registerCommand('braindump.process', async () => {
    await processBrainDump(context, statusBar);
  });

  const undoCommand = vscode.commands.registerCommand('braindump.undo', async () => {
    if (!lastSnapshots || lastSnapshots.length === 0) {
      vscode.window.showInformationMessage('BrainDump: Nothing to undo.');
      return;
    }
    try {
      const restored = await undoOperations(lastSnapshots);
      lastSnapshots = null;
      vscode.window.showInformationMessage(`BrainDump: Undid last operation (${restored} file(s) restored).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`BrainDump: Undo failed: ${message}`);
    }
  });

  const selectModelCommand = vscode.commands.registerCommand('braindump.selectModel', async () => {
    const models = await listAvailableModels();
    if (models.length === 0) {
      vscode.window.showWarningMessage('BrainDump: No AI models detected. Install GitHub Copilot or add a model via Chat > Manage Models.');
      return;
    }

    const config = vscode.workspace.getConfiguration('braindump');
    const currentModel = config.get<string>('ai.model', '');

    const items = models.map((m) => ({
      label: m.name,
      description: m.id,
      detail: m.vendor ? `vendor: ${m.vendor}` : undefined,
      picked: m.id === currentModel,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: currentModel ? `Current: ${currentModel}` : 'Select a model for BrainDump',
      title: 'BrainDump: Select Model',
    });

    if (picked) {
      await config.update('ai.model', picked.description, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`BrainDump: Model set to ${picked.label}`);
    }
  });

  context.subscriptions.push(processCommand);
  context.subscriptions.push(undoCommand);
  context.subscriptions.push(selectModelCommand);

  // Run initial backend detection for status bar tooltip
  const initialModel = getSettings().ai.model || undefined;
  detectBackend(initialModel).then((backend) => {
    updateStatusBarBackend(statusBar, backend?.name ?? null);
  });
}

export function deactivate() {
  // cleanup handled by disposables
}

async function processBrainDump(
  context: vscode.ExtensionContext,
  statusBar: vscode.StatusBarItem,
): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('BrainDump: No workspace folder open.');
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri;

  const settings = getSettings();
  const projectConfig = await readProjectConfig(workspaceRoot);

  // 1. Detect backend
  const backend = await detectBackend(settings.ai.model || undefined);
  if (!backend) {
    vscode.window.showErrorMessage(
      'BrainDump: No AI backend found. Install GitHub Copilot or add a model via BYOK (Chat > Manage Models).',
    );
    return;
  }
  updateStatusBarBackend(statusBar, backend.name);

  // 2. Read brain dump file
  const brainDumpUri = vscode.Uri.joinPath(workspaceRoot, settings.inputFile);
  let rawText: string;
  try {
    const doc = await vscode.workspace.openTextDocument(brainDumpUri);
    rawText = doc.getText().trim();
  } catch {
    vscode.window.showErrorMessage(
      `BrainDump: Could not read "${settings.inputFile}". Make sure the file exists in your workspace root.`,
    );
    return;
  }

  if (rawText.length === 0) {
    vscode.window.showInformationMessage(
      `BrainDump: "${settings.inputFile}" is empty. Write or dictate some thoughts first!`,
    );
    return;
  }

  // 3. Archive brain dump if history is enabled (before processing)
  if (settings.history.enabled) {
    try {
      await archiveBrainDump(rawText, workspaceRoot, settings.history.directory);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`History archive error: ${message}`);
    }
  }

  // 4. Clarification pass (lightweight, before plan)
  let clarificationAnswers: ClarificationAnswer[] | undefined;
  let clarificationSuggestions: SuggestionNote[] | undefined;

  if (backend.clarify) {
    const streaming = createStreamingClarificationPanel(context.extensionUri);

    try {
      const fileTree = await generateFileTree(settings.fileTree.maxDepth);
      const clarifyResult = await backend.clarify(
        {
          rawText,
          workspaceContext: projectConfig.workspaceContext,
          fileTree,
          promptConfig: projectConfig.prompts,
        },
        new vscode.CancellationTokenSource().token,
        (chunk) => streaming.sendChunk(chunk),
      );

      if (clarifyResult.clarifications.length > 0) {
        const clarifyMessage = await streaming.finalize(clarifyResult);

        if (clarifyMessage.type === 'cancel') {
          vscode.window.showInformationMessage('BrainDump: Cancelled.');
          return;
        }
        if (clarifyMessage.type === 'continue') {
          clarificationAnswers = clarifyMessage.answers;
        }
        // 'skip' → proceed without answers
      } else {
        // No questions — dispose the streaming panel
        streaming.panel.dispose();
      }

      if (clarifyResult.suggestions.length > 0) {
        clarificationSuggestions = clarifyResult.suggestions;
      }
    } catch (err) {
      // Clarification pass failed — dispose panel and continue without it
      streaming.panel.dispose();
      const message = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`Clarification pass error (non-fatal): ${message}`);
    }
  }

  // 5. Plan pass
  await processWithAI(context, backend, rawText, settings, projectConfig, workspaceRoot, brainDumpUri, statusBar, clarificationAnswers, clarificationSuggestions);
}

async function processWithAI(
  context: vscode.ExtensionContext,
  backend: AIBackend,
  rawText: string,
  settings: ReturnType<typeof getSettings>,
  projectConfig: ProjectConfig,
  workspaceRoot: vscode.Uri,
  brainDumpUri: vscode.Uri,
  _statusBar: vscode.StatusBarItem,
  clarificationAnswers?: ClarificationAnswer[],
  clarificationSuggestions?: SuggestionNote[],
): Promise<void> {
  outputChannel.appendLine(`--- BrainDump Processing (${new Date().toISOString()}) ---`);
  outputChannel.appendLine(`Backend: ${backend.name}`);
  outputChannel.appendLine(`Input: ${rawText.length} characters`);
  if (clarificationAnswers && clarificationAnswers.length > 0) {
    outputChannel.appendLine(`Clarification answers: ${JSON.stringify(clarificationAnswers)}`);
  }

  // Generate file tree
  const fileTree = await generateFileTree(settings.fileTree.maxDepth);

  // Create streaming panel
  const streaming = createStreamingPanel(context.extensionUri);

  let plan: BrainDumpPlan | null = null;

  try {
    plan = await backend.process(
      {
        rawText,
        workspaceContext: projectConfig.workspaceContext,
        fileTree,
        clarificationAnswers,
        promptConfig: projectConfig.prompts,
      },
      new vscode.CancellationTokenSource().token,
      (chunk) => streaming.sendChunk(chunk),
    );

    outputChannel.appendLine(`Result: ${plan.fileOperations.length} file ops, ${plan.actionItems.length} action items`);
  } catch (err) {
    streaming.panel.dispose();
    if (err instanceof ParseError) {
      outputChannel.appendLine('Parse error. Raw AI response:');
      outputChannel.appendLine(err.rawResponse);
      outputChannel.show();
      vscode.window.showErrorMessage(
        `BrainDump: Failed to parse AI response. See Output > BrainDump for details.`,
      );
    } else {
      const message = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`Error: ${message}`);
      vscode.window.showErrorMessage(`BrainDump: ${message}`);
    }
    return;
  }

  // Merge suggestions from clarification pass into the plan
  if (clarificationSuggestions && clarificationSuggestions.length > 0) {
    plan.suggestions = [...clarificationSuggestions, ...(plan.suggestions ?? [])];
  }

  // Show the review panel with parsed results
  const reviewResult = await streaming.finalize(plan);
  await handleReviewResult(reviewResult, context, backend, rawText, settings, projectConfig, workspaceRoot, brainDumpUri, _statusBar);
}

async function handleReviewResult(
  reviewResult: ReviewMessage,
  context: vscode.ExtensionContext,
  backend: AIBackend,
  rawText: string,
  settings: ReturnType<typeof getSettings>,
  projectConfig: ProjectConfig,
  workspaceRoot: vscode.Uri,
  brainDumpUri: vscode.Uri,
  statusBar: vscode.StatusBarItem,
): Promise<void> {
  if (reviewResult.type === 'cancel') {
    vscode.window.showInformationMessage('BrainDump: Cancelled.');
    return;
  }

  if (reviewResult.type === 'reprocess') {
    // Re-run the plan pass only (no new clarification round)
    outputChannel.appendLine('--- Re-processing ---');
    await processWithAI(context, backend, rawText, settings, projectConfig, workspaceRoot, brainDumpUri, statusBar);
    return;
  }

  // type === 'apply'
  const approval = reviewResult.data;

  // 5. Apply approved file operations
  let appliedFiles = 0;
  let appliedActions = 0;

  if (approval.fileOperations.length > 0) {
    try {
      const { result, snapshots } = await applyOperations(approval.fileOperations, workspaceRoot);
      appliedFiles = result.created + result.appended + result.edited;
      lastSnapshots = snapshots; // Save for undo
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`BrainDump: Failed to apply file changes: ${message}`);
      return;
    }
  }

  // 6. Write action items
  if (approval.actionItems.length > 0) {
    try {
      appliedActions = await writeActionItems(approval.actionItems, workspaceRoot);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`BrainDump: Failed to write action items: ${message}`);
    }
  }

  // 7. Post-process
  try {
    await postProcess(settings.postProcess, brainDumpUri, workspaceRoot, settings.history.directory);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`Post-process error: ${message}`);
  }

  // 8. Summary
  const parts: string[] = [];
  if (appliedFiles > 0) {
    parts.push(`${appliedFiles} file(s) updated`);
  }
  if (appliedActions > 0) {
    parts.push(`${appliedActions} action item(s) saved`);
  }
  if (parts.length > 0) {
    vscode.window.showInformationMessage(`BrainDump: Done! ${parts.join(', ')}.`);
  } else {
    vscode.window.showInformationMessage('BrainDump: No changes applied.');
  }
}
