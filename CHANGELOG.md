# Changelog

## v1.5.10 - 2026-04-23

- feat: expose the show-window global hotkey in Settings (Inbar Rotem)
- fix: empty showWindowHotkey setting disables the global hotkey (Inbar Rotem)
- fix: improve changelog display across website, app, and release workflow (@dorlugasigal)
- fix: restore generate_release_notes alongside explicit body (@dorlugasigal)
- chore(release): v1.5.6 [skip ci] (@github-actions[bot])
- feat: add author attribution to changelog and simplify workflow scripts (@dorlugasigal)
- chore(release): v1.5.7 [skip ci] (@github-actions[bot])
- feat: replace version external link with changelog modal (@dorlugasigal)
- fix: fetch changelog via main process IPC to bypass CSP (@dorlugasigal)
- fix: strip duplicate changelog header from modal content (@dorlugasigal)
- fix: reduce excessive spacing in changelog modal (@dorlugasigal)
- feat: link author names to GitHub profiles in changelog (@dorlugasigal)
- fix: resolve GitHub usernames reliably from commit emails (@dorlugasigal)
- fix: simplify author attribution with sed-based username extraction (@dorlugasigal)
- chore(release): v1.5.8 [skip ci] (@github-actions[bot])
- refactor: use gh api for author attribution instead of sed (@dorlugasigal)
- chore(release): v1.5.9 [skip ci] (@github-actions[bot])
- fix: add git pull --rebase before push to handle concurrent commits [skip ci] (@dorlugasigal)


## v1.5.9 - 2026-04-23

- refactor: use gh api for author attribution instead of sed (@dorlugasigal)


## v1.5.8 - 2026-04-23

- Maintenance and improvements


## v1.5.7 - 2026-04-23

- feat: add author attribution to changelog and simplify workflow scripts (dorlugasigal)


## v1.5.6 - 2026-04-23

- fix: restore generate_release_notes alongside explicit body
- fix: improve changelog display across website, app, and release workflow
- fix: empty showWindowHotkey setting disables the global hotkey
- feat: expose the show-window global hotkey in Settings


## v1.3.6

### New Features

- **Configurable AI session commands**: Copilot and Claude Code base commands are now customizable via Settings > Terminal — use custom aliases or wrapper scripts (#4)

## v1.3.4

### New Features

- **Clipboard image paste**: Screenshot to clipboard, then Ctrl+V (or Cmd+V on macOS) pastes the image as a temp file path — useful for sharing screenshots with AI tools like Claude Code and Copilot

### Fixes

- **macOS paste**: Paste shortcuts (Ctrl+V / Cmd+V) now work correctly on macOS across main and detached terminal windows
