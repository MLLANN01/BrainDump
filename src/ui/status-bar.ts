import * as vscode from 'vscode';

export function createStatusBarItem(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.command = 'braindump.process';
  item.text = '$(symbol-misc) BrainDump';
  item.tooltip = 'Process brain dump file';
  item.show();
  return item;
}

export function updateStatusBarBackend(item: vscode.StatusBarItem, backendName: string | null): void {
  if (backendName) {
    item.tooltip = `Process brain dump file (backend: ${backendName})`;
  } else {
    item.tooltip = 'Process brain dump file (no AI backend detected)';
  }
}
