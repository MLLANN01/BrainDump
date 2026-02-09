import { BrainDumpRequest } from '../backends/types.js';
import { PromptConfig } from '../config/prompt-defaults.js';

/**
 * Build a lightweight clarification prompt. Given the brain dump, workspace context,
 * and file tree, returns only clarification questions and suggestion notes.
 * No file operations, no action items.
 */
export function buildClarificationPrompt(request: BrainDumpRequest, config: PromptConfig): string {
  const sections: string[] = [];

  sections.push(config.clarification.systemRole);

  if (request.workspaceContext) {
    sections.push(`## Workspace Context
${request.workspaceContext}`);
  }

  sections.push(`## Workspace File Tree
${request.fileTree}`);

  sections.push(`## Brain Dump Text
${request.rawText}`);

  sections.push(`## Instructions
${config.clarification.instructions}

## Output Format
Respond with ONLY a JSON object. No markdown fences, no explanation:

{
  "clarifications": [
    {
      "id": "unique-id",
      "question": "What did you mean by X?",
      "suggestedOptions": ["Option A", "Option B"],
      "context": "Why you are asking this"
    }
  ],
  "suggestions": [
    {
      "type": "interpretation" | "recommendation" | "warning",
      "message": "Description of what was interpreted, recommended, or warned about",
      "relatedFiles": ["optional/related/file.ts"]
    }
  ]
}

Important:
- Include at most ${config.clarification.maxQuestions} clarifying questions
- "clarifications" and "suggestions" should be empty arrays if none are needed
- suggestion types: "interpretation" (explain how you would interpret something ambiguous), "recommendation" (suggest a better approach), "warning" (flag a potential issue)
- Do NOT include file operations, action items, or a plan — only questions and suggestions`);

  return sections.join('\n\n');
}

export function buildPrompt(request: BrainDumpRequest, config: PromptConfig, fileContents?: Map<string, string>): string {
  const sections: string[] = [];

  sections.push(config.plan.systemRole);

  if (request.workspaceContext) {
    sections.push(`## Workspace Context
${request.workspaceContext}`);
  }

  sections.push(`## Workspace File Tree
${request.fileTree}`);

  // Include actual file contents when available (two-pass: content pass)
  if (fileContents && fileContents.size > 0) {
    const fileSections: string[] = [];
    for (const [filePath, content] of fileContents) {
      fileSections.push(`### ${filePath}\n\`\`\`\n${content}\n\`\`\``);
    }
    sections.push(`## Existing File Contents\nThese are the contents of files relevant to the brain dump. Use them for precise "edit" operations with exact search/replace blocks.\n\n${fileSections.join('\n\n')}`);
  }

  // Include previous clarification answers if this is a re-process with answers
  if (request.clarificationAnswers && request.clarificationAnswers.length > 0) {
    const qaPairs = request.clarificationAnswers
      .map((a) => `- **Q (${a.questionId}):** answered "${a.answer}"`)
      .join('\n');
    sections.push(`## Previous Clarification Answers
The user answered your earlier clarification questions. Incorporate these answers into your plan. Do not ask the same questions again.

${qaPairs}`);
  }

  sections.push(`## Brain Dump Text
${request.rawText}`);

  sections.push(`## Instructions
${config.plan.instructions}`);

  sections.push(`## Output Format
Respond with ONLY a JSON object matching this exact schema. No markdown fences, no explanation, just the raw JSON:

{
  "summary": "One sentence describing what this brain dump contained",
  "fileOperations": [
    {
      "action": "create" | "append" | "edit",
      "filePath": "path/relative/to/workspace/root",
      "description": "Human-readable description of this change",
      "content": "The full file content (create), text to append (append), or replacement text (edit)",
      "searchBlock": "For edit only: the exact text to find and replace in the file"
    }
  ],
  "actionItems": [
    {
      "description": "What needs to be done",
      "priority": "high" | "medium" | "low",
      "relatedFiles": ["optional/related/file.ts"],
      "targetFile": "optional/path/to/project/TODO.md"
    }
  ],
  "suggestions": [
    {
      "type": "interpretation" | "recommendation" | "warning",
      "message": "Description of what was interpreted, recommended, or warned about",
      "relatedFiles": ["optional/related/file.ts"]
    }
  ]
}

Important:
${config.plan.outputRules}`);

  return sections.join('\n\n');
}

/**
 * Build an intent-pass prompt that asks the AI which existing files it needs to read
 * for precise edits. Used in two-pass processing.
 */
export function buildIntentPrompt(request: BrainDumpRequest, config: PromptConfig): string {
  const sections: string[] = [];

  sections.push(config.intent.systemRole);

  if (request.workspaceContext) {
    sections.push(`## Workspace Context
${request.workspaceContext}`);
  }

  sections.push(`## Workspace File Tree
${request.fileTree}`);

  sections.push(`## Brain Dump Text
${request.rawText}`);

  sections.push(`## Output Format
Respond with ONLY a JSON object. No markdown fences, no explanation:

{
  "filesToRead": ["path/relative/to/workspace/root.ts", "another/file.md"],
  "reasoning": "Brief explanation of why these files need to be read"
}

If no existing files need to be edited, return an empty array for filesToRead.`);

  return sections.join('\n\n');
}
