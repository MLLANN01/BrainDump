import { BrainDumpPlan, ClarificationResult, FileOperation, ActionItem, ClarificationQuestion, SuggestionNote } from '../backends/types.js';

export class ParseError extends Error {
  constructor(message: string, public readonly rawResponse: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export function parseResponse(raw: string): BrainDumpPlan {
  const jsonString = extractJson(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new ParseError(
      `Failed to parse AI response as JSON: ${err instanceof Error ? err.message : String(err)}`,
      raw,
    );
  }

  return validatePlan(parsed, raw);
}

export interface IntentResult {
  filesToRead: string[];
  reasoning: string;
}

export function parseIntentResponse(raw: string): IntentResult {
  const jsonString = extractJson(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new ParseError(
      `Failed to parse intent response as JSON: ${err instanceof Error ? err.message : String(err)}`,
      raw,
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new ParseError('Intent response is not a JSON object', raw);
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.filesToRead)) {
    return { filesToRead: [], reasoning: '' };
  }

  const filesToRead = obj.filesToRead.filter((f: unknown): f is string => typeof f === 'string');
  const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning : '';

  return { filesToRead, reasoning };
}

export function parseClarificationResponse(raw: string): ClarificationResult {
  const jsonString = extractJson(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new ParseError(
      `Failed to parse clarification response as JSON: ${err instanceof Error ? err.message : String(err)}`,
      raw,
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { clarifications: [], suggestions: [] };
  }

  const obj = parsed as Record<string, unknown>;

  // Parse clarifications
  let clarifications: ClarificationQuestion[] = [];
  if (Array.isArray(obj.clarifications) && obj.clarifications.length > 0) {
    clarifications = obj.clarifications
      .filter((c: unknown): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .map((c: Record<string, unknown>) => {
        const q: ClarificationQuestion = {
          id: typeof c.id === 'string' ? c.id : String(c.id ?? ''),
          question: typeof c.question === 'string' ? c.question : '',
        };
        if (Array.isArray(c.suggestedOptions)) {
          q.suggestedOptions = c.suggestedOptions.filter((o: unknown): o is string => typeof o === 'string');
        }
        if (typeof c.context === 'string') {
          q.context = c.context;
        }
        return q;
      })
      .filter((q) => q.id && q.question);
  }

  // Parse suggestions
  const validSuggestionTypes = ['interpretation', 'recommendation', 'warning'] as const;
  let suggestions: SuggestionNote[] = [];
  if (Array.isArray(obj.suggestions) && obj.suggestions.length > 0) {
    suggestions = obj.suggestions
      .filter((s: unknown): s is Record<string, unknown> => typeof s === 'object' && s !== null)
      .map((s: Record<string, unknown>) => {
        const note: SuggestionNote = {
          type: (validSuggestionTypes as readonly string[]).includes(s.type as string)
            ? (s.type as SuggestionNote['type'])
            : 'interpretation',
          message: typeof s.message === 'string' ? s.message : '',
        };
        if (Array.isArray(s.relatedFiles)) {
          note.relatedFiles = s.relatedFiles.filter((f: unknown): f is string => typeof f === 'string');
        }
        return note;
      })
      .filter((n) => n.message);
  }

  return { clarifications, suggestions };
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();

  // Try to strip markdown code fences
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Try to find a JSON object in the response
  const braceStart = trimmed.indexOf('{');
  const braceEnd = trimmed.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    return trimmed.slice(braceStart, braceEnd + 1);
  }

  return trimmed;
}

function validatePlan(parsed: unknown, raw: string): BrainDumpPlan {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new ParseError('AI response is not a JSON object', raw);
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.summary !== 'string') {
    throw new ParseError('AI response missing "summary" string field', raw);
  }

  if (!Array.isArray(obj.fileOperations)) {
    throw new ParseError('AI response missing "fileOperations" array field', raw);
  }

  if (!Array.isArray(obj.actionItems)) {
    throw new ParseError('AI response missing "actionItems" array field', raw);
  }

  const fileOperations: FileOperation[] = obj.fileOperations.map((op: unknown, i: number) => {
    if (typeof op !== 'object' || op === null) {
      throw new ParseError(`fileOperations[${i}] is not an object`, raw);
    }
    const item = op as Record<string, unknown>;

    if (item.action !== 'create' && item.action !== 'append' && item.action !== 'edit') {
      throw new ParseError(`fileOperations[${i}].action must be "create", "append", or "edit", got "${String(item.action)}"`, raw);
    }
    if (typeof item.filePath !== 'string' || item.filePath.length === 0) {
      throw new ParseError(`fileOperations[${i}].filePath must be a non-empty string`, raw);
    }
    if (typeof item.description !== 'string') {
      throw new ParseError(`fileOperations[${i}].description must be a string`, raw);
    }
    if (typeof item.content !== 'string') {
      throw new ParseError(`fileOperations[${i}].content must be a string`, raw);
    }
    if (item.action === 'edit') {
      if (typeof item.searchBlock !== 'string' || item.searchBlock.length === 0) {
        throw new ParseError(`fileOperations[${i}].searchBlock is required for "edit" actions`, raw);
      }
    }

    const fileOp: FileOperation = {
      action: item.action,
      filePath: item.filePath,
      description: item.description,
      content: item.content,
    };
    if (item.action === 'edit' && typeof item.searchBlock === 'string') {
      fileOp.searchBlock = item.searchBlock;
    }
    return fileOp;
  });

  const actionItems: ActionItem[] = obj.actionItems.map((ai: unknown, i: number) => {
    if (typeof ai !== 'object' || ai === null) {
      throw new ParseError(`actionItems[${i}] is not an object`, raw);
    }
    const item = ai as Record<string, unknown>;

    if (typeof item.description !== 'string' || item.description.length === 0) {
      throw new ParseError(`actionItems[${i}].description must be a non-empty string`, raw);
    }

    const actionItem: ActionItem = { description: item.description };

    if (item.priority !== undefined) {
      if (item.priority !== 'high' && item.priority !== 'medium' && item.priority !== 'low') {
        throw new ParseError(`actionItems[${i}].priority must be "high", "medium", or "low"`, raw);
      }
      actionItem.priority = item.priority;
    }

    if (item.relatedFiles !== undefined) {
      if (!Array.isArray(item.relatedFiles) || !item.relatedFiles.every((f: unknown) => typeof f === 'string')) {
        throw new ParseError(`actionItems[${i}].relatedFiles must be an array of strings`, raw);
      }
      actionItem.relatedFiles = item.relatedFiles as string[];
    }

    if (item.targetFile !== undefined) {
      if (typeof item.targetFile !== 'string' || item.targetFile.length === 0) {
        throw new ParseError(`actionItems[${i}].targetFile must be a non-empty string`, raw);
      }
      actionItem.targetFile = item.targetFile;
    }

    return actionItem;
  });

  // Parse optional suggestions
  let suggestions: SuggestionNote[] | undefined;
  const validSuggestionTypes = ['interpretation', 'recommendation', 'warning'] as const;
  if (Array.isArray(obj.suggestions) && obj.suggestions.length > 0) {
    suggestions = obj.suggestions
      .filter((s: unknown): s is Record<string, unknown> => typeof s === 'object' && s !== null)
      .map((s: Record<string, unknown>) => {
        const note: SuggestionNote = {
          type: (validSuggestionTypes as readonly string[]).includes(s.type as string)
            ? (s.type as SuggestionNote['type'])
            : 'interpretation',
          message: typeof s.message === 'string' ? s.message : '',
        };
        if (Array.isArray(s.relatedFiles)) {
          note.relatedFiles = s.relatedFiles.filter((f: unknown): f is string => typeof f === 'string');
        }
        return note;
      })
      .filter((n) => n.message);
    if (suggestions.length === 0) {
      suggestions = undefined;
    }
  }

  const plan: BrainDumpPlan = {
    summary: obj.summary,
    fileOperations,
    actionItems,
  };
  if (suggestions) {
    plan.suggestions = suggestions;
  }
  return plan;
}
