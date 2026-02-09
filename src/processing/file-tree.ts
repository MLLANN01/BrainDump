import * as vscode from 'vscode';
import * as path from 'path';

interface TreeNode {
  name: string;
  isDirectory: boolean;
  children: Map<string, TreeNode>;
}

export async function generateFileTree(maxDepth: number): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return '(no workspace open)';
  }

  const rootUri = workspaceFolders[0].uri;
  const excludePattern = '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/*.lock,**/.DS_Store}';

  const files = await vscode.workspace.findFiles('**/*', excludePattern, 5000);

  const root: TreeNode = {
    name: path.basename(rootUri.fsPath),
    isDirectory: true,
    children: new Map(),
  };

  for (const file of files) {
    const relativePath = vscode.workspace.asRelativePath(file, false);
    const parts = relativePath.split('/');

    if (parts.length > maxDepth) {
      continue;
    }

    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          isDirectory: !isLast,
          children: new Map(),
        });
      }
      current = current.children.get(part)!;
    }
  }

  return formatTree(root, '', true);
}

function formatTree(node: TreeNode, prefix: string, isRoot: boolean): string {
  const lines: string[] = [];

  const sortedChildren = Array.from(node.children.entries()).sort(([, a], [, b]) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const [, child] of sortedChildren) {
    if (child.isDirectory) {
      lines.push(`${prefix}${child.name}/`);
      lines.push(formatTree(child, prefix + '  ', false));
    } else {
      lines.push(`${prefix}${child.name}`);
    }
  }

  return lines.filter(Boolean).join('\n');
}
