import * as vscode from 'vscode';
import { archiveBrainDump } from './history.js';

export async function postProcess(
  mode: 'clear' | 'keep' | 'archive',
  brainDumpUri: vscode.Uri,
  workspaceRoot?: vscode.Uri,
  historyDir?: string,
): Promise<void> {
  if (mode === 'keep') {
    return;
  }

  if (mode === 'archive' && workspaceRoot && historyDir) {
    const doc = await vscode.workspace.openTextDocument(brainDumpUri);
    const text = doc.getText();
    if (text.trim().length > 0) {
      await archiveBrainDump(text, workspaceRoot, historyDir);
    }
  }

  // Both 'clear' and 'archive' clear the file after processing
  const edit = new vscode.WorkspaceEdit();
  const doc = await vscode.workspace.openTextDocument(brainDumpUri);
  const fullRange = new vscode.Range(
    doc.positionAt(0),
    doc.positionAt(doc.getText().length),
  );
  edit.replace(brainDumpUri, fullRange, '');
  await vscode.workspace.applyEdit(edit);
  await doc.save();
}
