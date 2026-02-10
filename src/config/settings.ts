import * as vscode from 'vscode';

export interface BrainDumpSettings {
  inputFile: string;
  outputFile: string;
  postProcess: 'clear' | 'keep' | 'archive';
  ai: {
    backend: 'auto' | 'vscode-lm';
    model: string;
  };
  fileTree: {
    maxDepth: number;
  };
  history: {
    enabled: boolean;
    directory: string;
  };
}

export function getSettings(): BrainDumpSettings {
  const config = vscode.workspace.getConfiguration('braindump');

  return {
    inputFile: config.get<string>('inputFile', 'braindump.txt'),
    outputFile: config.get<string>('outputFile', 'braindump-context.md'),
    postProcess: config.get<'clear' | 'keep' | 'archive'>('postProcess', 'clear'),
    ai: {
      backend: config.get<'auto' | 'vscode-lm'>('ai.backend', 'auto'),
      model: config.get<string>('ai.model', ''),
    },
    fileTree: {
      maxDepth: config.get<number>('fileTree.maxDepth', 4),
    },
    history: {
      enabled: config.get<boolean>('history.enabled', true),
      directory: config.get<string>('history.directory', '.braindump-history'),
    },
  };
}
