import * as vscode from 'vscode';

/**
 * Archive brain dump text with a timestamp.
 * Stores in the configured history directory (default: .braindump-history/).
 */
export async function archiveBrainDump(
  rawText: string,
  workspaceRoot: vscode.Uri,
  historyDir: string,
): Promise<vscode.Uri> {
  const dirUri = vscode.Uri.joinPath(workspaceRoot, historyDir);

  // Ensure directory exists
  try {
    await vscode.workspace.fs.stat(dirUri);
  } catch {
    await vscode.workspace.fs.createDirectory(dirUri);
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
  const fileName = `braindump-${timestamp}.txt`;
  const fileUri = vscode.Uri.joinPath(dirUri, fileName);

  const content = new TextEncoder().encode(rawText);
  await vscode.workspace.fs.writeFile(fileUri, content);

  return fileUri;
}
