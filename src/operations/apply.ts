import * as vscode from 'vscode';
import { FileOperation } from '../backends/types.js';

export interface ApplyResult {
  created: number;
  appended: number;
  edited: number;
  skipped: string[];
}

/** Snapshot of a file before modification, used for undo */
export interface FileSnapshot {
  uri: vscode.Uri;
  existed: boolean;
  content: string; // empty string if file didn't exist
}

export async function applyOperations(
  operations: FileOperation[],
  workspaceRoot: vscode.Uri,
): Promise<{ result: ApplyResult; snapshots: FileSnapshot[] }> {
  const edit = new vscode.WorkspaceEdit();
  const result: ApplyResult = { created: 0, appended: 0, edited: 0, skipped: [] };
  const snapshots: FileSnapshot[] = [];

  for (const op of operations) {
    const fileUri = vscode.Uri.joinPath(workspaceRoot, op.filePath);

    if (op.action === 'create') {
      const exists = await fileExists(fileUri);
      if (exists) {
        result.skipped.push(op.filePath);
        continue;
      }
      snapshots.push({ uri: fileUri, existed: false, content: '' });
      edit.createFile(fileUri, { overwrite: false, ignoreIfExists: true });
      edit.insert(fileUri, new vscode.Position(0, 0), op.content);
      result.created++;
    } else if (op.action === 'append') {
      const exists = await fileExists(fileUri);
      if (!exists) {
        snapshots.push({ uri: fileUri, existed: false, content: '' });
        edit.createFile(fileUri, { overwrite: false, ignoreIfExists: true });
        edit.insert(fileUri, new vscode.Position(0, 0), op.content);
        result.created++;
      } else {
        const doc = await vscode.workspace.openTextDocument(fileUri);
        snapshots.push({ uri: fileUri, existed: true, content: doc.getText() });
        const lastLine = doc.lineAt(doc.lineCount - 1);
        const endPosition = lastLine.range.end;
        const prefix = lastLine.text.length > 0 ? '\n' : '';
        edit.insert(fileUri, endPosition, prefix + op.content);
        result.appended++;
      }
    } else if (op.action === 'edit') {
      if (!op.searchBlock) {
        result.skipped.push(`${op.filePath} (missing searchBlock)`);
        continue;
      }
      const exists = await fileExists(fileUri);
      if (!exists) {
        result.skipped.push(`${op.filePath} (file not found)`);
        continue;
      }
      const doc = await vscode.workspace.openTextDocument(fileUri);
      const text = doc.getText();
      const searchIndex = text.indexOf(op.searchBlock);
      if (searchIndex === -1) {
        result.skipped.push(`${op.filePath} (searchBlock not found)`);
        continue;
      }
      snapshots.push({ uri: fileUri, existed: true, content: text });
      const startPos = doc.positionAt(searchIndex);
      const endPos = doc.positionAt(searchIndex + op.searchBlock.length);
      edit.replace(fileUri, new vscode.Range(startPos, endPos), op.content);
      result.edited++;
    }
  }

  const success = await vscode.workspace.applyEdit(edit);
  if (!success) {
    throw new Error('Failed to apply workspace edit. Some changes may not have been saved.');
  }

  if (result.skipped.length > 0) {
    vscode.window.showWarningMessage(
      `BrainDump: Skipped ${result.skipped.length} operation(s): ${result.skipped.join(', ')}`,
    );
  }

  return { result, snapshots };
}

/** Restore files to their pre-operation state */
export async function undoOperations(snapshots: FileSnapshot[]): Promise<number> {
  const edit = new vscode.WorkspaceEdit();
  let restored = 0;

  for (const snap of snapshots) {
    if (!snap.existed) {
      // File was created — delete it
      edit.deleteFile(snap.uri, { ignoreIfNotExists: true });
      restored++;
    } else {
      // File existed — restore original content
      try {
        const doc = await vscode.workspace.openTextDocument(snap.uri);
        const fullRange = new vscode.Range(
          doc.positionAt(0),
          doc.positionAt(doc.getText().length),
        );
        edit.replace(snap.uri, fullRange, snap.content);
        restored++;
      } catch {
        // File may have been deleted externally
      }
    }
  }

  const success = await vscode.workspace.applyEdit(edit);
  if (!success) {
    throw new Error('Failed to undo operations.');
  }
  return restored;
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
