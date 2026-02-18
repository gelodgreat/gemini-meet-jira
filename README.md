# gemini-meet-jira

Automatically creates Jira tickets from Google Meet action items using Gemini's AI meeting notes.

**Approach**: Google Apps Script — free, no external services, stays entirely within your Google Workspace.

---

## How It Works

```
Google Meet ends
  → Gemini auto-generates "Notes from [Meeting]" Google Doc
    → Time-based trigger polls Drive every 5 min
      → Finds new docs matching Gemini naming patterns
        → Script reads the "Next Steps" section
          → One Jira ticket created per action item
            → Document marked as processed (no duplicates)
```

---

## Prerequisites

| Requirement                    | Details                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| **Google Workspace**           | Business Standard or higher (Gemini notes require this plan)                                |
| **Gemini "Take notes for me"** | Must be enabled in Google Meet settings                                                     |
| **Jira Cloud**                 | A Jira Cloud instance (not Jira Server/Data Center)                                         |
| **Jira API Token**             | Generate at [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens) |

---

## Setup

### Step 1 — Create a new Google Apps Script project

1. Go to [script.google.com](https://script.google.com)
2. Click **New project**
3. Rename the project to `gemini-meet-jira` (optional but helpful)

### Step 2 — Add the script files

Delete the default `Code.gs` file, then create these files in order:

| File              | How to create                                      |
| ----------------- | -------------------------------------------------- |
| `Config.gs`       | Click **+** → Script file → name it `Config`       |
| `DriveWatcher.gs` | Click **+** → Script file → name it `DriveWatcher` |
| `NotesParser.gs`  | Click **+** → Script file → name it `NotesParser`  |
| `JiraClient.gs`   | Click **+** → Script file → name it `JiraClient`   |
| `Code.gs`         | Click **+** → Script file → name it `Code`         |

Paste the contents of each `src/*.gs` file from this repository into the matching file in the Apps Script editor.

### Step 3 — Configure your credentials

Open **Config.gs** and fill in your values:

```javascript
var CONFIG = {
  JIRA_BASE_URL: "https://yourcompany.atlassian.net", // Required
  JIRA_EMAIL: "you@yourcompany.com", // Required
  JIRA_API_TOKEN: "your-api-token", // Required
  JIRA_PROJECT_KEY: "PROJ", // Required
  JIRA_ISSUE_TYPE: "Task", // Required
  JIRA_DEFAULT_PRIORITY: "Medium", // Required

  JIRA_ASSIGNEE_MAP: {
    // Optional
    // "john smith": "atlassian-account-id",
  },

  MEETING_NOTES_FOLDER_ID: "", // Optional: restrict to a specific Drive folder
  NOTIFICATION_EMAIL: "", // Optional: get emailed after each meeting
};
```

#### Getting your Jira API token

1. Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **Create API token**
3. Give it a label (e.g. `gemini-meet-jira`)
4. Copy the token and paste it into `JIRA_API_TOKEN`

#### Finding Jira account IDs for assignee mapping (optional)

In the Apps Script editor, run `findJiraUser("John Smith")` — it will log the account ID you need for `JIRA_ASSIGNEE_MAP`.

### Step 4 — Test your Jira connection

1. In the Apps Script editor, select the function `testJiraConnection` from the function dropdown
2. Click **Run**
3. Check the **Execution log** — you should see:
   ```
   ✅ Jira connection successful!
      Connected as: Your Name
   ```

If you get an error, double-check `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` in Config.gs.

### Step 5 — Install the trigger

1. Select the function `installTrigger` from the dropdown
2. Click **Run**
3. **Grant permissions** when prompted:
   - Google Drive (to detect new files)
   - Google Docs (to read meeting notes)
   - Gmail (to send notification emails, if configured)
   - External requests (to call the Jira API)
4. Check the Execution log for:
   ```
   ✅ Time-based trigger installed (every 5 min).
   ```

You can verify the trigger was created by running `listTriggers()`.

### Step 6 — Test with a real meeting (or manually)

**Option A — Real meeting test:**

1. Start a Google Meet
2. Enable "Take notes for me" (Gemini icon in the toolbar)
3. Talk for a few minutes, mention action items like "John will review the proposal"
4. End the meeting
5. Wait ~1–2 minutes for Gemini to generate the notes doc
6. Wait up to 5 minutes for the next poll cycle (or run `testPoll()` immediately)
7. Check your Jira project — tickets should appear

**Option B — Manual test with an existing doc:**

1. Open `Code.gs`
2. Find `testWithDocId()` and replace `PASTE_YOUR_DOC_ID_HERE` with the ID of a Gemini meeting notes doc
   - The doc ID is in the URL: `https://docs.google.com/document/d/**THIS_IS_THE_ID**/edit`
3. Run `testWithDocId()`
4. Check the Execution log and your Jira project

---

## File Structure

```
gemini-meet-jira/
├── src/
│   ├── Config.gs         ← Edit this first: credentials & settings
│   ├── Code.gs           ← Main entry point & trigger management
│   ├── DriveWatcher.gs   ← Detects Gemini notes, prevents duplicates
│   ├── NotesParser.gs    ← Reads Google Doc structure, extracts action items
│   └── JiraClient.gs     ← Jira REST API v3 client
├── docs/
│   └── plans/
│       └── 2026-02-17-gemini-meet-jira-integration-research.md
└── README.md
```

---

## Debugging

### Check the Execution Log

Every Apps Script run produces logs. View them at **View → Execution log** in the Apps Script editor.

### Useful debug functions

| Function                  | What it does                                    |
| ------------------------- | ----------------------------------------------- |
| `testJiraConnection()`    | Verify credentials work                         |
| `testPoll()`              | Run the polling function manually right now     |
| `listProjectIssueTypes()` | See what issue types are in your project        |
| `findJiraUser("Name")`    | Look up a Jira account ID for assignee mapping  |
| `testParserOnly()`        | Parse a doc without creating any tickets        |
| `testWithDocId()`         | Process a specific doc manually                 |
| `listProcessedDocs()`     | See which docs have been processed              |
| `clearProcessedDoc(id)`   | Allow a specific doc to be re-processed         |
| `clearProcessedDocs()`    | Reset all deduplication records (use carefully) |
| `listTriggers()`          | Confirm the polling trigger is installed        |

### Common issues

**No tickets created after a meeting**

- Check that Gemini notes were actually generated (look in Drive for a doc starting with "Notes from")
- The doc filename must match one of the patterns: `Notes from`, `Meeting notes for`, `Meeting notes -`, `Notes for`, `AI notes from`
- Make sure `installTrigger()` was run and shows in `listTriggers()`
- Check the Execution log for error messages

**"Jira API returned 401"**

- Your API token or email is wrong — regenerate the token and update Config.gs

**"Jira API returned 404"**

- Check `JIRA_PROJECT_KEY` — it should be the short key shown in issue numbers (e.g. `PROJ` for `PROJ-123`)
- Check `JIRA_ISSUE_TYPE` — run `listProjectIssueTypes()` to see valid types

**"Jira API returned 400"**

- The issue type or project key might not match. Run `listProjectIssueTypes()` for valid values.

**Parser finds 0 action items**

- Run `testParserOnly()` to see what the parser extracts
- Gemini may have named the section differently — check the actual doc and compare to `CONFIG.SECTIONS.NEXT_STEPS`

**Duplicate tickets being created**

- This shouldn't happen if `markAsProcessed()` runs correctly
- Run `listProcessedDocs()` to check if the doc ID was recorded

---

## Known Limitations

| Limitation                                         | Impact                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| Polling-based, not real-time                       | New notes detected within CONFIG.POLL_INTERVAL_MINUTES (default 5 min) |
| Gemini notes require Business Standard+            | Won't work on Workspace Starter plans                                  |
| Assignee mapping is manual                         | You must maintain the name → account ID map in Config.gs               |
| Apps Script execution time limit                   | 6-minute max — effectively unlimited for normal meeting sizes          |
| Google Meet REST API Smart Notes (v2beta) not used | We read via Google Docs API instead — more stable                      |

---

## How Gemini Structures Meeting Notes

Understanding the document structure helps if you need to adjust the parser:

```
[Document title: "Notes from My Meeting - Feb 17, 2026"]

Summary
  Paragraph text describing the overall meeting...

Decisions
  • We will adopt the new authentication approach (Aligned)
  • The launch date moves to Q2 (Disagreed)

Next Steps
  • Review the proposal document (John Smith)
  • Update the API schema - Jane Doe
  • Schedule follow-up by next Friday

Details
  Extended breakdown of the discussion...
```

The `NotesParser.gs` detects section boundaries by checking Google Docs paragraph heading styles (H1–H4) and falls back to checking for bold text matching known section names.

---

## Security Notes

- Your Jira API token is stored in plain text in Config.gs — do not share this script with anyone you wouldn't trust with Jira access
- The script runs under your Google account and has access to your Drive files
- No data is sent to any third-party service — only to your own Jira instance
- To revoke access, delete the trigger (`removeTrigger()`) and the script itself

---

## License

MIT
