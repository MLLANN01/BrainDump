# BrainDump

**AI-powered workspace organization for VS Code.** Dump your thoughts into a text file, press a button, and let AI organize them into files, edits, and action items across your workspace.

<video src="https://raw.githubusercontent.com/MLLANN01/BrainDump/main/media/recording.mp4" controls muted width="600"></video>

## Quick Start

1. Install the extension
2. Have an AI backend available (GitHub Copilot Free tier works — no API key needed)
3. Create a `braindump.txt` file in your workspace root
4. Write or dictate your thoughts into it
5. Click the Brain button in the editor title bar, or run **BrainDump: Process Brain Dump** from the command palette

## How It Works

1. **Dump** — Write or dictate your thoughts into a brain dump file. Ramble freely, switch topics, use shorthand.
2. **Process** — The AI reads your dump alongside your workspace structure. It runs a two-pass analysis: first identifying which existing files need to be read, then producing a precise plan with full context.
3. **Stream** — Watch the AI response stream in real-time in the review panel.
4. **Review** — A panel shows every proposed change: file creations, appends, search/replace edits, and action items. Edit any field — fix paths, tweak content, adjust search blocks — before approving.
5. **Apply** — Approved changes are applied atomically via a single workspace edit. Action items are written to your TODO file. Undo everything with one command if needed.

## Features

### File Operations
- **Create** new files with full content
- **Append** to existing files (TODOs, changelogs, configs)
- **Edit** existing files using search/replace blocks — the AI finds the exact text and replaces it

### Two-Pass Processing
The AI automatically determines which existing files it needs to read before making edits. This means edit operations get the actual file contents for precise, context-aware search/replace blocks rather than guessing.

### Streaming Response
The review panel opens immediately and displays the raw AI response as it streams in. Once complete, it switches to the full editable review interface.

### Editable Review Panel
Every field in the review panel is editable before you apply:
- File paths, descriptions, and content for file operations
- Search blocks and replacement text for edits
- Action item descriptions and priorities
- Uncheck any item to exclude it

### Clarifications & Suggestions
Before processing your brain dump, the AI runs a lightweight clarification pass. If your dump is ambiguous, it asks up to 5 targeted clarifying questions (configurable) with suggested options in a dedicated panel. Answer the questions and click **Continue with Answers**, or click **Skip** to process as-is. Clarifications happen at most once — the plan pass never generates new questions, structurally preventing infinite loops. The AI also surfaces informational suggestions: interpretations it made, recommendations, and warnings, displayed as color-coded cards in both the clarification and review panels.

### Re-process
Not happy with the AI's plan? Click **Re-process** in the review panel to re-run the plan pass on the same input. Re-processing goes straight to planning (no new clarification round).

### Undo
Run **BrainDump: Undo Last Operation** to reverse all file changes from the last processing session. Created files are deleted, modified files are restored to their pre-edit state.

### History / Archive
Every brain dump is automatically archived with a timestamp to `.braindump-history/` before processing. Never lose a thought, even after the dump file is cleared.

### .braindump Config File
Drop a `.braindump` YAML file in your workspace root to describe your project. This is a project descriptor committed to your repo — it tells the AI about your workspace structure and lets you customize prompt behavior. Extension settings (inputFile, postProcess, history, etc.) are configured in VS Code settings only.

```yaml
workspaceContext: |
  Node.js backend API with Express and TypeScript.
  Routes in src/routes/, one file per resource.
  Tests in tests/, mirroring src/ structure.

prompts:
  clarification:
    maxQuestions: 3
  plan:
    systemRole: |
      You are a senior staff engineer organizing a brain dump
      into precise file operations for a production codebase.
```

### Prompt Customization

The `prompts` section lets you override the AI prompt strings used during each processing pass. Any key you omit falls back to the built-in default. This is useful for tuning AI behavior per-project without editing extension code.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `prompts.clarification.systemRole` | string | *(built-in)* | Persona/role for the clarification pass |
| `prompts.clarification.instructions` | string | *(built-in)* | What to analyze, when to ask questions |
| `prompts.clarification.maxQuestions` | number | `5` | Maximum number of clarifying questions |
| `prompts.plan.systemRole` | string | *(built-in)* | Persona/role for the plan pass |
| `prompts.plan.instructions` | string | *(built-in)* | The numbered processing rules the AI follows |
| `prompts.plan.outputRules` | string | *(built-in)* | Constraints on the JSON output (the "Important:" bullets) |
| `prompts.intent.systemRole` | string | *(built-in)* | Persona/role for the intent pass (which files to read) |

The JSON output schemas are not configurable — they are structural and must match the parser.

**Example — restrict to 2 clarification questions and use a custom plan persona:**

```yaml
prompts:
  clarification:
    maxQuestions: 2
  plan:
    systemRole: |
      You are a senior engineer reviewing a brain dump.
      Be conservative: only create files when explicitly requested.
```

## Commands

| Command | Description |
|---------|-------------|
| `BrainDump: Process Brain Dump` | Process the brain dump file through AI |
| `BrainDump: Undo Last Operation` | Reverse all file changes from the last run |

The Brain button also appears in the editor title bar when a file matching `braindump` is open, and in the status bar at all times.

## Settings

All settings are under the `braindump.*` namespace.

| Setting | Default | Description |
|---------|---------|-------------|
| `braindump.inputFile` | `braindump.txt` | Path to the brain dump file, relative to workspace root |
| `braindump.postProcess` | `clear` | What to do after processing: `clear`, `keep`, or `archive` |
| `braindump.ai.backend` | `auto` | AI backend: `auto` or `vscode-lm` |
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
