import { BrainDumpContext, ClarificationResult, ClarificationQuestion, SuggestionNote } from '../backends/types.js';

export class ParseError extends Error {
  constructor(message: string, public readonly rawResponse: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export function parseContextResponse(raw: string): BrainDumpContext {
  let content = raw.trim();

  // Strip accidental markdown code fence wrapper (```markdown ... ```)
  const fenceMatch = content.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n\s*```$/);
  if (fenceMatch) {
    content = fenceMatch[1].trim();
  }

  return { markdownContent: content };
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

export function extractJson(raw: string): string {
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
