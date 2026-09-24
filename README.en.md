# Bookmarklet Context Menu

[日本語](README.md) | English

A Manifest V3 Chrome extension for running bookmarklets from the right-click context menu and managing them from a dedicated options page. It supports registration, editing, reordering, search, JSON import/export, manual import from Chrome bookmarks, and bidirectional synchronization with selected Chrome bookmark folders.

## v0.4.1

- Select multiple Chrome bookmark folders as synchronization roots
- Recursively synchronize bookmarklets under each synchronization root
- Detect bookmarklet and folder moves and automatically reflect entries moving into or out of the synchronization scope
- Select the Chrome destination folder for newly created bookmarklets from within the synchronization scope
- Use the Chrome Bookmark ID as the identity key for synchronized entries
- Run full consistency reconciliation with `syncAll()` at startup, after bookmark import, and on manual synchronization
- Monitor Chrome bookmark create, change, move, and remove events
- Migrate the v0.3.x `bookmarkId` field to `chromeBookmarkId` with the schema v4 migration
- Migrate parent folders of bookmarklets synchronized in v0.3.x into the initial synchronization roots
- Automatically repair missing synchronization roots, missing destination folders, and redundant parent/child synchronization roots
- Treat Chrome as the source of truth for conflicts originating from Chrome
- Keep entries imported from JSON as extension-local entries
- Manually add bookmarklets from the Chrome bookmark list even when they are outside the synchronization scope
- Keep manually added entries as local copies without modifying the original Chrome bookmarks
- If the source of a manually added entry later enters the synchronization scope, promote the existing entry to a synchronized entry based on the same Chrome Bookmark ID instead of creating a duplicate

## Installation

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository folder.
4. On Chrome 138 or later, open the extension's **Details** page and enable **Allow User Scripts**.
5. Click the extension icon to open the management page.

## Synchronization Behavior

The synchronization scope consists of one or more synchronization roots selected on the management page and all of their descendants. Only bookmarks whose URLs begin with `javascript:` are synchronized.

- Created in Chrome: added to the extension when created inside the synchronization scope
- Title/URL changed in Chrome: reflected in the extension
- Normal URL → `javascript:`: added when inside the synchronization scope
- `javascript:` → normal URL: removed from synchronized extension entries
- Moved from outside → inside the synchronization scope: added
- Moved from inside → outside the synchronization scope: removed from the extension without deleting the Chrome bookmark
- Folder moved: all descendants are re-evaluated
- Deleted in Chrome: removed from the extension
- Synchronized entry edited in the extension: Chrome is updated, then synchronization runs again
- Synchronized entry deleted in the extension: after confirmation, the Chrome bookmark is also deleted
- Conflict found at startup: converges to the Chrome version

## Manual Import from Chrome Bookmarks

The Chrome bookmark list on the management page can also be used independently of automatic synchronization.

A bookmarklet outside the synchronization scope can be manually added to the extension. The original Chrome bookmark is not modified; the extension keeps a local copy. Duplicate manual imports are prevented.

If the original Chrome bookmark later moves into the synchronization scope, the existing manually added entry is promoted to a synchronized entry using the same Chrome Bookmark ID. A second duplicate entry is not created.

## Data

The extension mainly stores the following data in `chrome.storage.local`:

- `schemaVersion`: `4`
- `bookmarklets`: registered bookmarklets; synchronized entries retain `chromeBookmarkId`
- `syncSettings`: `enabled`, `rootFolderIds`, `defaultSaveFolderId`, `lastSyncAt`, `lastSyncCount`

## Limitations

- Chrome extensions cannot add custom extension items to the context menu of Chrome's standard bookmarks bar or bookmark manager.
- Bookmarklets cannot run on pages where Chrome prohibits script injection, such as `chrome://` pages and the Chrome Web Store.
- v0.4.1 does not mirror the Chrome bookmark folder hierarchy in the right-click context menu.
