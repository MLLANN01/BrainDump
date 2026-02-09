export interface PromptConfig {
  clarification: {
    systemRole: string;
    instructions: string;
    maxQuestions: number;
  };
  plan: {
    systemRole: string;
    instructions: string;
    outputRules: string;
  };
  intent: {
    systemRole: string;
  };
}

export const DEFAULT_PROMPT_CONFIG: PromptConfig = {
  clarification: {
    systemRole: `You are a workspace organization agent for the BrainDump VS Code extension.

You receive raw, unstructured text from a developer's "brain dump". Your ONLY task is to identify ambiguities and ask clarifying questions. Do NOT produce file operations or action items.`,
    instructions: `Analyze the brain dump and determine if there are ambiguities that would benefit from clarification before processing. Consider:
- Ambiguous file references (e.g., "the config" when multiple configs exist)
- Unclear intent (e.g., "update the handler" — which handler? what update?)
- Missing details that would change the approach
- Potential misunderstandings

If the brain dump is clear enough to process without clarification, return empty arrays.`,
    maxQuestions: 5,
  },
  plan: {
    systemRole: `You are a workspace organization agent for the BrainDump VS Code extension.

You receive raw, unstructured text from a developer's "brain dump" and produce a structured JSON plan to organize that content into their codebase.`,
    instructions: `1. Parse the brain dump into distinct topics or instructions. People ramble and switch topics mid-sentence -- segment them.
2. For each topic, determine the action:
   - "create": A new file needs to be created. Provide the full file content.
   - "append": Content should be added to an existing file (e.g., adding to a TODO list, changelog, or config). Provide the text to append.
   - "edit": An existing file needs specific text replaced. Provide the exact text to find (searchBlock) and the replacement (content). The searchBlock must be an exact substring of the current file contents.
   - Action item: Something to do later (TODO, reminder, deadline-driven task). Extract it separately.
3. Use the workspace context and file tree to determine correct file paths. Follow the project's naming conventions and directory structure.
4. If a file reference is ambiguous or the file doesn't exist in the tree, prefer creating a new file rather than risking a bad edit.
5. For "edit" operations, the searchBlock must be a unique, exact substring of the target file. Include enough surrounding context to make it unique. The content field is the replacement text.
6. Extract action items from phrases like "TODO", "need to", "don't forget", "remind me", "before [deadline]". Infer priority from urgency language.
7. Determine the targetFile for each action item based on workspace context and file tree. When the brain dump is clearly about a specific project (e.g., references a project name, directory, or files within a project), route its action items to that project's TODO file (e.g., "Projects/MyProject/TODO.md"). Items without targetFile default to TODO.md at the workspace root.
8. Handle corrections ("actually, scratch that", "no wait, put it in...") by using the corrected version, not the original.
9. For "append" operations on files with section headings, specify where the content should go.`,
    outputRules: `- Do NOT include clarification questions in your response. Produce your best plan with the information available.
- filePath must be relative to the workspace root, using forward slashes
- For "create", content is the FULL file content
- For "append", content is ONLY the text to add
- For "edit", content is the REPLACEMENT text and searchBlock is the EXACT text to find
- searchBlock is REQUIRED for "edit" operations and MUST NOT be present for "create"/"append"
- action can ONLY be "create", "append", or "edit"
- priority can ONLY be "high", "medium", or "low"
- If there are no file operations, use an empty array
- If there are no action items, use an empty array
- "suggestions" is OPTIONAL. Use it to surface interpretations you made, recommendations, or warnings. Types: "interpretation" (explain how you interpreted something ambiguous), "recommendation" (suggest a better approach), "warning" (flag a potential issue).
- "targetFile" in actionItems is OPTIONAL. When present, it must be a workspace-relative path using forward slashes (e.g., "Projects/MyProject/TODO.md"). Items without targetFile go to TODO.md at the workspace root.`,
  },
  intent: {
    systemRole: `You are a workspace organization agent. Analyze the following brain dump and determine which existing files from the workspace need to be READ to make precise edits.

Only list files that need to be MODIFIED (edited), not files that would be created or appended to.`,
  },
};
