# Changelog

All notable changes to the BrainDump extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0]

### Changed
- **Pivoted from file operations to context document generation.** BrainDump now produces a single structured Markdown file (`braindump-context.md`) instead of applying file creates/edits/appends to the workspace. The output is a self-contained brief ready to hand to Copilot, Claude, or any AI coding agent.
- AI prompts rewritten: the plan pass is now a context synthesis pass that outputs raw Markdown instead of JSON with file operations.
- Review panel replaced with an editable textarea showing the generated Markdown. Three buttons: **Save Context File**, **Cancel**, **Re-process**.
- Saving writes the context document to the workspace root and opens it in the editor.
- Intent pass broadened: AI now selects files to read "for context" rather than "for precise edits."
- `.braindump` config key `prompts.plan` renamed to `prompts.context`. The `plan` key is still accepted for backward compatibility.
- Streaming display now shows Markdown forming in real-time (previously showed raw JSON).

### Added
- `braindump.outputFile` setting (default: `braindump-context.md`) — configurable path for the generated context document.

### Removed
- `BrainDump: Undo Last Operation` command — no longer applicable since the extension no longer modifies workspace files directly.
- File operation application (create/append/edit with undo snapshots).
- Action item extraction and TODO.md writing.
- `src/operations/apply.ts` and `src/operations/action-items.ts` deleted.

## [0.2.0] - 2025-05-25

### Changed
- Renamed package to `braindumpai`.

## [0.1.0] - 2025-05-25

### Added
- Initial release.
- AI-powered brain dump processing with clarification pass, intent pass, and plan pass.
- Two-pass file reading for precise edit operations.
- Streaming review panel with editable file operations and action items.
- Atomic workspace edits with single-command undo.
- Action item extraction to TODO.md with target file routing.
- `.braindump` YAML project config with prompt customization.
- Brain dump history/archiving.
- Post-processing (clear/keep/archive) for the input file.
- Status bar integration and model selection.
