import * as vscode from 'vscode';
import { BrainDumpContext, ClarificationResult, ClarificationAnswer } from '../backends/types.js';

export type ReviewMessage =
  | { type: 'save'; markdownContent: string }
  | { type: 'cancel' }
  | { type: 'reprocess' };

export type ClarificationMessage =
  | { type: 'continue'; answers: ClarificationAnswer[] }
  | { type: 'skip' }
  | { type: 'cancel' };

/**
 * Show a streaming review panel. Displays raw AI text while streaming,
 * then switches to the context review UI once complete.
 */
export function createStreamingPanel(
  extensionUri: vscode.Uri,
): {
  panel: vscode.WebviewPanel;
  sendChunk: (chunk: string) => void;
  finalize: (bdContext: BrainDumpContext) => Promise<ReviewMessage>;
} {
  const panel = vscode.window.createWebviewPanel(
    'braindump.review',
    'BrainDump Review',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [extensionUri],
    },
  );

  panel.webview.html = getStreamingContent();

  return {
    panel,
    sendChunk: (chunk: string) => {
      panel.webview.postMessage({ type: 'chunk', text: chunk });
    },
    finalize: (bdContext: BrainDumpContext) => {
      return new Promise((resolve) => {
        panel.webview.html = getContextReviewContent(bdContext);

        panel.webview.onDidReceiveMessage((message: ReviewMessage) => {
          if (message.type === 'save' || message.type === 'cancel' || message.type === 'reprocess') {
            resolve(message);
            panel.dispose();
          }
        });

        panel.onDidDispose(() => {
          resolve({ type: 'cancel' });
        });
      });
    },
  };
}

/**
 * Create a streaming clarification panel. Displays raw AI text while streaming,
 * then switches to the clarification UI once parsing succeeds.
 * If there are no clarifications, the caller can dispose the panel.
 */
export function createStreamingClarificationPanel(
  extensionUri: vscode.Uri,
): {
  panel: vscode.WebviewPanel;
  sendChunk: (chunk: string) => void;
  finalize: (result: ClarificationResult) => Promise<ClarificationMessage>;
} {
  const panel = vscode.window.createWebviewPanel(
    'braindump.clarify',
    'BrainDump — Clarifications',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [extensionUri],
    },
  );

  panel.webview.html = getStreamingContent('BrainDump — Clarifications', 'Checking for ambiguities...');

  return {
    panel,
    sendChunk: (chunk: string) => {
      panel.webview.postMessage({ type: 'chunk', text: chunk });
    },
    finalize: (result: ClarificationResult) => {
      return new Promise((resolve) => {
        panel.webview.html = getClarificationContent(result);

        panel.webview.onDidReceiveMessage((message: ClarificationMessage) => {
          if (message.type === 'continue' || message.type === 'skip' || message.type === 'cancel') {
            resolve(message);
            panel.dispose();
          }
        });

        panel.onDidDispose(() => {
          resolve({ type: 'cancel' });
        });
      });
    },
  };
}

function getClarificationContent(result: ClarificationResult): string {
  const clarificationsJson = JSON.stringify(result.clarifications);
  const hasSuggestions = result.suggestions.length > 0;
  const hasClarifications = result.clarifications.length > 0;

  const suggestionsHtml = hasSuggestions
    ? result.suggestions
        .map((s) => {
          const icon = s.type === 'interpretation' ? '\u2139\uFE0F' : s.type === 'recommendation' ? '\uD83D\uDCA1' : '\u26A0\uFE0F';
          const borderColor = s.type === 'interpretation'
            ? 'var(--vscode-editorInfo-foreground)'
            : s.type === 'recommendation'
              ? 'var(--vscode-testing-iconPassed)'
              : 'var(--vscode-editorWarning-foreground)';
          const relatedHtml = s.relatedFiles && s.relatedFiles.length > 0
            ? `<div class="suggestion-files">${s.relatedFiles.map((f) => `<code>${escapeHtml(f)}</code>`).join(' ')}</div>`
            : '';
          return `<div class="suggestion-card" style="border-left-color: ${borderColor}">
            <span class="suggestion-icon">${icon}</span>
            <div class="suggestion-body">
              <span class="suggestion-type">${escapeHtml(s.type)}</span>
              <span class="suggestion-message">${escapeHtml(s.message)}</span>
              ${relatedHtml}
            </div>
          </div>`;
        })
        .join('\n')
    : '';

  const clarificationsHtml = hasClarifications
    ? result.clarifications
        .map((c, i) => {
          const chipsHtml = (c.suggestedOptions ?? [])
            .map(
              (opt, j) =>
                `<button class="chip" data-q="${i}" data-opt="${j}">${escapeHtml(opt)}</button>`,
            )
            .join('');
          const contextHtml = c.context
            ? `<div class="clarification-context">${escapeHtml(c.context)}</div>`
            : '';
          return `<div class="clarification-item" data-q-index="${i}">
            <div class="clarification-question">${escapeHtml(c.question)}</div>
            ${contextHtml}
            ${chipsHtml ? `<div class="chip-container">${chipsHtml}</div>` : ''}
            <input type="text" class="clarification-input" data-q-id="${escapeAttr(c.id)}" placeholder="Type your answer..." />
          </div>`;
        })
        .join('\n')
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      margin: 0;
    }
    h1 { font-size: 1.4em; margin: 0 0 4px 0; }
    .intro {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 20px;
    }
    h2 {
      font-size: 1.1em;
      margin: 20px 0 10px 0;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 4px;
    }
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    button {
      padding: 6px 16px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 0.9em;
      font-family: var(--vscode-font-family);
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .btn-cancel {
      margin-left: auto;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      border: 1px solid var(--vscode-panel-border);
    }
    .btn-cancel:hover { color: var(--vscode-foreground); }

    /* Suggestions */
    .suggestions-container { margin-bottom: 16px; }
    .suggestions-container summary {
      font-size: 1em;
      font-weight: 600;
      color: var(--vscode-foreground);
      cursor: pointer;
    }
    .suggestion-card {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 12px;
      margin: 6px 0;
      border-left: 3px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
      border-radius: 0 4px 4px 0;
    }
    .suggestion-icon { font-size: 1.1em; flex-shrink: 0; }
    .suggestion-body { flex: 1; }
    .suggestion-type {
      display: inline-block;
      font-size: 0.75em;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin-right: 6px;
    }
    .suggestion-message { font-size: 0.9em; }
    .suggestion-files { margin-top: 4px; }
    .suggestion-files code {
      font-size: 0.8em;
      padding: 1px 4px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 3px;
      margin-right: 4px;
    }

    /* Clarifications */
    .clarifications-container {
      border: 2px solid var(--vscode-editorInfo-foreground);
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 16px;
      background: var(--vscode-editor-background);
    }
    .clarifications-container h2 {
      margin-top: 0;
      border-bottom: none;
      color: var(--vscode-editorInfo-foreground);
    }
    .clarification-item {
      margin: 10px 0;
      padding: 8px 0;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .clarification-item:last-child { border-bottom: none; }
    .clarification-question {
      font-weight: 600;
      margin-bottom: 4px;
    }
    .clarification-context {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }
    .chip-container {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 6px;
    }
    .chip {
      padding: 3px 10px;
      border: 1px solid var(--vscode-button-secondaryBackground);
      border-radius: 12px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      font-size: 0.85em;
      cursor: pointer;
    }
    .chip:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .chip.selected {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }
    .clarification-input {
      display: block;
      width: 100%;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 3px;
      padding: 4px 8px;
      box-sizing: border-box;
    }
    .clarification-input:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
  </style>
</head>
<body>
  <h1>BrainDump \u2014 Clarifications</h1>
  <p class="intro">The AI has some questions before processing your brain dump. Answer below and continue, or skip to process as-is.</p>

  ${hasSuggestions ? `<details class="suggestions-container" open>
    <summary>Suggestions (${result.suggestions.length})</summary>
    ${suggestionsHtml}
  </details>` : ''}

  ${hasClarifications ? `<div class="clarifications-container">
    <h2>Questions (${result.clarifications.length})</h2>
    ${clarificationsHtml}
  </div>` : ''}

  <div class="actions">
    <button class="btn-primary" id="continueBtn">Continue with Answers</button>
    <button class="btn-secondary" id="skipBtn">Skip \u2014 Process as-is</button>
    <button class="btn-cancel" id="cancelBtn">Cancel</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const clarifications = ${clarificationsJson};

    // Chip click: populate text input and show selected state
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const container = chip.closest('.clarification-item');
        container.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        container.querySelector('.clarification-input').value = chip.textContent;
      });
    });

    document.getElementById('continueBtn').addEventListener('click', () => {
      const answers = [];
      document.querySelectorAll('.clarification-input').forEach(input => {
        const val = input.value.trim();
        if (val) {
          answers.push({ questionId: input.dataset.qId, answer: val });
        }
      });
      vscode.postMessage({ type: 'continue', answers: answers });
    });

    document.getElementById('skipBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'skip' });
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });
  </script>
</body>
</html>`;
}

function getStreamingContent(
  title: string = 'BrainDump Review',
  statusText: string = 'Processing your brain dump...',
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      margin: 0;
    }
    h1 { font-size: 1.4em; margin: 0 0 12px 0; }
    .status {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid var(--vscode-descriptionForeground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #stream-output {
      font-family: var(--vscode-editor-font-family);
      font-size: 0.85em;
      line-height: 1.5;
      white-space: pre-wrap;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 12px;
      max-height: 70vh;
      overflow-y: auto;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="status"><div class="spinner"></div> ${escapeHtml(statusText)}</div>
  <div id="stream-output"></div>
  <script>
    const output = document.getElementById('stream-output');
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'chunk') {
        output.textContent += msg.text;
        output.scrollTop = output.scrollHeight;
      }
    });
  </script>
</body>
</html>`;
}

function getContextReviewContent(bdContext: BrainDumpContext): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      margin: 0;
      display: flex;
      flex-direction: column;
      height: 100vh;
      box-sizing: border-box;
    }
    h1 { font-size: 1.4em; margin: 0 0 4px 0; }
    .intro {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 12px;
    }
    .editor-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    #context-editor {
      flex: 1;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.85em;
      line-height: 1.5;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 4px;
      padding: 12px;
      resize: none;
      tab-size: 2;
      box-sizing: border-box;
      white-space: pre-wrap;
    }
    #context-editor:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }
    button {
      padding: 6px 16px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 0.9em;
      font-family: var(--vscode-font-family);
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .btn-reprocess {
      margin-left: auto;
      background: var(--vscode-editorWarning-foreground);
      color: var(--vscode-editor-background);
    }
    .btn-reprocess:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <h1>BrainDump \u2014 Context Document</h1>
  <p class="intro">Review and edit the generated context document below. Save it to your workspace, or re-process to generate a new one.</p>

  <div class="editor-container">
    <textarea id="context-editor" spellcheck="false">${escapeHtml(bdContext.markdownContent)}</textarea>
  </div>

  <div class="actions">
    <button class="btn-primary" id="saveBtn">Save Context File</button>
    <button class="btn-secondary" id="cancelBtn">Cancel</button>
    <button class="btn-reprocess" id="reprocessBtn">Re-process</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    document.getElementById('saveBtn').addEventListener('click', () => {
      const content = document.getElementById('context-editor').value;
      vscode.postMessage({ type: 'save', markdownContent: content });
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });

    document.getElementById('reprocessBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'reprocess' });
    });
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
