# BrainDump

**AI that prepares the brief for your AI.** Dump your thoughts into a text file, press a button, and get a structured Markdown context document ready to hand to Copilot, Claude, or any AI coding agent.

Nothing else fills this gap. You have rough notes, voice-to-text transcripts, scattered TODOs — and you need them turned into a clear, self-contained brief that an AI agent can act on. BrainDump handles the messy middle: it clarifies ambiguities, reads your codebase for context, and synthesizes everything into one document.

<video src="https://raw.githubusercontent.com/MLLANN01/BrainDump/main/media/recording.mp4" controls muted width="600"></video>

## Quick Start

1. Install the extension
2. Have an AI backend available (GitHub Copilot Free tier works — no API key needed)
3. Create a `braindump.txt` file in your workspace root
4. Write or dictate your thoughts into it
5. Click the Brain button in the editor title bar, or run **BrainDump: Process Brain Dump** from the command palette
6. Review the generated context document, edit if needed, and save

## How It Works

1. **Dump** — Write or dictate your thoughts into a brain dump file. Ramble freely, switch topics, use shorthand.
2. **Clarify** — The AI runs a lightweight pass to spot ambiguities. If your dump is unclear, it asks targeted questions before proceeding. Skip if you prefer.
3. **Synthesize** — The AI reads your dump alongside your workspace structure and file contents, then produces a structured Markdown context document: clear summary, relevant code excerpts with file paths, and remaining TODOs.
4. **Review** — The context document appears in an editable panel. Tweak anything — fix phrasing, add details, remove sections — before saving.
5. **Save** — The document is written to your workspace (default: `braindump-context.md`) and opened in the editor. Hand it to your AI agent of choice.

## What You Get

A single Markdown file (`braindump-context.md`) containing:

- A clear summary of what you want to accomplish
- Topics segmented from your rambling, each with context and relevant file paths
- Code excerpts from your actual codebase where relevant
- Clarification answers woven in naturally
- Open questions and remaining TODOs in a dedicated section

This is the document you paste into Copilot Chat, feed to Claude, or drop into any AI agent's context window. It's self-contained — the agent doesn't need your original brain dump.

## Features

### Clarifications & Suggestions
Before generating the context document, the AI runs a lightweight clarification pass. If your dump is ambiguous, it asks up to 5 targeted questions (configurable) with suggested options. Answer and click **Continue with Answers**, or click **Skip** to process as-is. The AI also surfaces informational suggestions: interpretations, recommendations, and warnings, displayed as color-coded cards.

### Two-Pass Context Gathering
The AI automatically determines which existing files it needs to read to provide context. File contents are included in the synthesis prompt so the generated document can reference actual code, not guesses.

### Streaming Response
The review panel opens immediately and displays the Markdown as it streams in. You see the document forming in real-time — much better UX than watching JSON gibberish.

### Editable Review Panel
The generated context document appears in a full-height editable textarea. Change anything before saving — fix wording, add notes, remove sections the AI got wrong.

### Re-process
Not happy with the output? Click **Re-process** to re-run synthesis on the same input. Re-processing goes straight to generation (no new clarification round).

### History / Archive
Every brain dump is automatically archived with a timestamp to `.braindump-history/` before processing. Never lose a thought, even after the dump file is cleared.

### .braindump Config File
Drop a `.braindump` YAML file in your workspace root to describe your project. This tells the AI about your workspace and lets you customize prompt behavior.

```yaml
workspaceContext: |
  Node.js backend API with Express and TypeScript.
  Routes in src/routes/, one file per resource.
  Tests in tests/, mirroring src/ structure.

prompts:
  clarification:
    maxQuestions: 3
  context:
    systemRole: |
      You are a senior staff engineer preparing a context brief
      for an AI coding agent working on a production codebase.
```

### Prompt Customization

The `prompts` section lets you override the AI prompt strings used during each processing pass. Any key you omit falls back to the built-in default.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `prompts.clarification.systemRole` | string | *(built-in)* | Persona/role for the clarification pass |
| `prompts.clarification.instructions` | string | *(built-in)* | What to analyze, when to ask questions |
| `prompts.clarification.maxQuestions` | number | `5` | Maximum number of clarifying questions |
| `prompts.context.systemRole` | string | *(built-in)* | Persona/role for the context synthesis pass |
| `prompts.context.instructions` | string | *(built-in)* | How to parse, segment, and synthesize the dump |
| `prompts.context.outputRules` | string | *(built-in)* | Markdown formatting rules for the output |
| `prompts.intent.systemRole` | string | *(built-in)* | Persona/role for the intent pass (which files to read) |

**Example — restrict to 2 clarification questions and use a custom context persona:**

```yaml
prompts:
  clarification:
    maxQuestions: 2
  context:
    systemRole: |
      You are a senior engineer preparing a brief.
      Be concise: only include information the AI agent needs.
```

> **Backward compatibility:** The `plan` key is still accepted as an alias for `context` in `.braindump` files.

## Commands

| Command | Description |
|---------|-------------|
| `BrainDump: Process Brain Dump` | Process the brain dump file and generate a context document |
| `BrainDump: Select Model` | Pick which AI model to use |

The Brain button also appears in the editor title bar when a file matching `braindump` is open, and in the status bar at all times.

## Settings

All settings are under the `braindump.*` namespace.

| Setting | Default | Description |
|---------|---------|-------------|
| `braindump.inputFile` | `braindump.txt` | Path to the brain dump file, relative to workspace root |
| `braindump.outputFile` | `braindump-context.md` | Path to the generated context document, relative to workspace root |
| `braindump.postProcess` | `clear` | What to do after processing: `clear`, `keep`, or `archive` |
| `braindump.ai.backend` | `auto` | AI backend: `auto` or `vscode-lm` |
| `braindump.ai.model` | *(empty)* | Preferred model ID. Run Select Model to pick. Leave empty for auto-detection |
| `braindump.fileTree.maxDepth` | `4` | Max directory depth for the workspace tree sent to AI |
| `braindump.history.enabled` | `true` | Archive each brain dump before processing |
| `braindump.history.directory` | `.braindump-history` | Directory for archived dumps |

## Requirements

- VS Code 1.95.0 or later
- An AI backend — one of:
  - **GitHub Copilot** (Free, Pro, or Enterprise) — recommended, zero config
  - **BYOK** (Bring Your Own Key) — add an Anthropic or OpenAI key via VS Code's Chat > Manage Models
  - Any VS Code Language Model provider

No API keys are required if you have Copilot installed.

## Building from Source

```bash
git clone https://github.com/MLLANN01/BrainDump.git
cd BrainDump
npm install
npm run build
```

Press **F5** in VS Code to launch the Extension Development Host for testing.

Use `npm run watch` for continuous rebuilds during development.

## Packaging

Build a `.vsix` file for local installation or distribution:

```bash
npm run package
```

This produces `braindump-0.2.0.vsix` in the project root.

Install from the `.vsix`:

```bash
code --install-extension braindump-0.2.0.vsix
```

Publish to the VS Code Marketplace (requires a [Personal Access Token](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token)):

```bash
npx vsce publish
```

## License

[ISC](LICENSE)
