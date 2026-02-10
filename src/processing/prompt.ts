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

export function buildContextPrompt(request: BrainDumpRequest, config: PromptConfig, fileContents?: Map<string, string>): string {
  const sections: string[] = [];

  sections.push(config.context.systemRole);

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
    sections.push(`## Existing File Contents\nThese are the contents of files relevant to the brain dump. Include relevant excerpts in the context document to help the AI agent understand the current state.\n\n${fileSections.join('\n\n')}`);
  }

  // Include previous clarification answers if this is a re-process with answers
  if (request.clarificationAnswers && request.clarificationAnswers.length > 0) {
    const qaPairs = request.clarificationAnswers
      .map((a) => `- **Q (${a.questionId}):** answered "${a.answer}"`)
      .join('\n');
    sections.push(`## Previous Clarification Answers
The user answered your earlier clarification questions. Incorporate these answers naturally into the context document.

${qaPairs}`);
  }

  sections.push(`## Brain Dump Text
${request.rawText}`);

  sections.push(`## Instructions
${config.context.instructions}`);

  sections.push(`## Output Rules
${config.context.outputRules}`);

  return sections.join('\n\n');
}

/**
 * Build an intent-pass prompt that asks the AI which existing files it needs to read
 * to provide context. Used in two-pass processing.
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

If no existing files need to be read for context, return an empty array for filesToRead.`);

  return sections.join('\n\n');
}
