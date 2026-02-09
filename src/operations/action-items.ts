import * as vscode from 'vscode';
import { ActionItem } from '../backends/types.js';

const DEFAULT_TARGET = 'TODO.md';
const DEFAULT_SECTION = '## Action Items';

export async function writeActionItems(
  items: ActionItem[],
  workspaceRoot: vscode.Uri,
): Promise<number> {
  if (items.length === 0) {
    return 0;
  }

  // Group items by target file
  const groups = new Map<string, ActionItem[]>();
  for (const item of items) {
    const target = item.targetFile || DEFAULT_TARGET;
    let group = groups.get(target);
    if (!group) {
      group = [];
      groups.set(target, group);
    }
    group.push(item);
  }

  // Write each group to its target file
  for (const [targetPath, groupItems] of groups) {
    await writeItemsToFile(groupItems, targetPath, workspaceRoot);
  }

  return items.length;
}

async function writeItemsToFile(
  items: ActionItem[],
  targetPath: string,
  workspaceRoot: vscode.Uri,
): Promise<void> {
  const targetUri = vscode.Uri.joinPath(workspaceRoot, targetPath);
  const formatted = items.map((item) => formatItem(item));
  const newContent = formatted.join('\n');

  let existingContent = '';
  let fileExisted = false;
  try {
    const doc = await vscode.workspace.openTextDocument(targetUri);
    existingContent = doc.getText();
    fileExisted = true;
  } catch {
    // File doesn't exist
  }

  let finalContent: string;

  if (!fileExisted) {
    finalContent = `${DEFAULT_SECTION}\n\n${newContent}\n`;
  } else if (existingContent.includes(DEFAULT_SECTION)) {
    // Find the section and append after it
    const sectionIndex = existingContent.indexOf(DEFAULT_SECTION);
    const afterSection = sectionIndex + DEFAULT_SECTION.length;

    // Find the next section heading or end of file
    const nextSectionMatch = existingContent.slice(afterSection).match(/\n## /);
    const insertPoint = nextSectionMatch
      ? afterSection + nextSectionMatch.index!
      : existingContent.length;

    // Determine if we need spacing
    const contentBetween = existingContent.slice(afterSection, insertPoint);
    const needsLeadingNewline = !contentBetween.endsWith('\n');
    const prefix = needsLeadingNewline ? '\n' : '';
    const trailingContent = existingContent.slice(insertPoint);
    const separator = trailingContent.length > 0 ? '\n' : '';

    finalContent =
      existingContent.slice(0, insertPoint) +
      prefix +
      newContent +
      '\n' +
      separator +
      trailingContent;
  } else {
    // Section doesn't exist -- append it at the end
    const prefix = existingContent.length > 0 && !existingContent.endsWith('\n') ? '\n\n' : '\n';
    finalContent = existingContent + prefix + `${DEFAULT_SECTION}\n\n${newContent}\n`;
  }

  const edit = new vscode.WorkspaceEdit();
  if (fileExisted) {
    const doc = await vscode.workspace.openTextDocument(targetUri);
    const fullRange = new vscode.Range(
      doc.positionAt(0),
      doc.positionAt(existingContent.length),
    );
    edit.replace(targetUri, fullRange, finalContent);
  } else {
    edit.createFile(targetUri, { overwrite: false });
    edit.insert(targetUri, new vscode.Position(0, 0), finalContent);
  }

  await vscode.workspace.applyEdit(edit);
}

function formatItem(item: ActionItem): string {
  const priorityTag = item.priority ? ` (${item.priority} priority)` : '';
  return `- [ ] ${item.description}${priorityTag}`;
}
