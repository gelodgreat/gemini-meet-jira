# gemini-meet-jira — Test Cases & Deployment Procedure

**Project**: Gemini Meet → Jira Integration (Google Apps Script)
**Date**: 2026-02-18
**Status**: Ready for deployment

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Deployment Procedure](#2-deployment-procedure)
3. [Test Cases](#3-test-cases)
4. [Creating a Simulated Gemini Notes Doc](#4-creating-a-simulated-gemini-notes-doc)
5. [Verification Checklist](#5-verification-checklist)
6. [Known Pitfalls](#6-known-pitfalls)
7. [Rollback Procedure](#7-rollback-procedure)

---

## 1. Prerequisites

| Requirement                        | Details                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| **Google Workspace**               | Business Standard ($16.80/user/mo) or higher — Gemini notes require this plan               |
| **Gemini "Take notes for me"**     | Must be enabled in Google Meet settings by a Workspace admin                                |
| **Jira Cloud**                     | A Jira Cloud instance (not Jira Server or Data Center)                                      |
| **Jira API Token**                 | Generate at [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens) |
| **Jira Project Key**               | The short prefix shown in issue numbers (e.g. `SS` for `SS-123`)                            |
| **Google Drive Folder (optional)** | A specific folder ID to restrict monitoring scope                                           |

---

## 2. Deployment Procedure

### Step 1 — Create Google Apps Script Project

1. Open [script.google.com](https://script.google.com)
2. Click **New project**
3. Rename the project to `gemini-meet-jira`

### Step 2 — Create Script Files

Delete the default `Code.gs`, then create 5 files in order:

| Order | File              | How to Create                                      |
| ----- | ----------------- | -------------------------------------------------- |
| 1     | `Config.gs`       | Click **+** → Script file → name it `Config`       |
| 2     | `DriveWatcher.gs` | Click **+** → Script file → name it `DriveWatcher` |
| 3     | `NotesParser.gs`  | Click **+** → Script file → name it `NotesParser`  |
| 4     | `JiraClient.gs`   | Click **+** → Script file → name it `JiraClient`   |
| 5     | `Code.gs`         | Click **+** → Script file → name it `Code`         |

Copy the contents of each `src/*.gs` file from this repository into the matching file in the Apps Script editor.

### Step 3 — Configure Credentials

Open `Config.gs` and fill in these **required** fields:

```javascript
JIRA_BASE_URL: "https://yourcompany.atlassian.net",  // No trailing slash!
JIRA_EMAIL: "you@yourcompany.com",
JIRA_API_TOKEN: "your-api-token",
JIRA_PROJECT_KEY: "PROJ",
JIRA_ISSUE_TYPE: "Task",
JIRA_DEFAULT_PRIORITY: "Medium",
```

**Optional** fields:

```javascript
JIRA_ASSIGNEE_MAP: {
  "john smith": "atlassian-account-id",
},
MEETING_NOTES_FOLDER_ID: "",       // Restrict to a specific Drive folder
POLL_INTERVAL_MINUTES: 5,          // How often to check for new notes (1-60)
LOOKBACK_HOURS: 24,                // How far back to search each cycle
NOTIFICATION_EMAIL: "",            // Get emailed after each meeting processed
```

### Step 4 — Test Jira Connection

1. Select `testJiraConnection` from the function dropdown
2. Click **Run**
3. Grant OAuth permissions when prompted
4. Check **Execution log** — expect:
   ```
   ✅ Jira connection successful!
      Connected as: Your Name
   ```

**If this fails**: double-check `JIRA_BASE_URL` (no trailing slash), `JIRA_EMAIL`, and `JIRA_API_TOKEN`.

### Step 5 — Verify Issue Types

1. Select `listProjectIssueTypes` from the dropdown
2. Click **Run**
3. Confirm that the value in `JIRA_ISSUE_TYPE` (default: `"Task"`) appears in the list

### Step 6 — Install the Trigger

1. Select `installTrigger` from the dropdown
2. Click **Run**
3. Grant additional permissions when prompted:
   - Google Drive (detect new files)
   - Google Docs (read meeting notes)
   - Gmail (send notification emails, if configured)
   - External requests (call the Jira API)
4. Check the Execution log for:
   ```
   ✅ Time-based trigger installed (every 5 min).
   ```

### Step 7 — Verify Trigger Installation

1. Select `listTriggers` from the dropdown
2. Click **Run**
3. Confirm output shows:
   ```
   Installed triggers (1):
     Handler: pollForMeetingNotes | Type: CLOCK | Source: CLOCK
   ```

### Step 8 — Run a Manual Test

See [Section 4](#4-creating-a-simulated-gemini-notes-doc) for creating a test document, then:

1. Open `Code.gs`
2. Find `testWithDocId()` and replace `PASTE_YOUR_DOC_ID_HERE` with your test doc ID
3. Select `testWithDocId` from the dropdown
4. Click **Run**
5. Check Execution log and your Jira project for new tickets

### Step 9 — Live Test with a Real Meeting

1. Start a Google Meet call
2. Enable **"Take notes for me"** (Gemini icon in the toolbar)
3. Discuss some action items (e.g. "John will review the proposal by Friday")
4. End the meeting
5. Wait 1–2 minutes for Gemini to generate the notes doc
6. Wait up to 5 minutes for the next poll cycle (or run `testPoll()` manually)
7. Check your Jira project for new tickets

---

## 3. Test Cases

### TC-01: Jira Connection

| Field            | Value                                                                           |
| ---------------- | ------------------------------------------------------------------------------- |
| **Function**     | `testJiraConnection()`                                                          |
| **Purpose**      | Verify Jira credentials and connectivity                                        |
| **Precondition** | Config.gs has valid `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`             |
| **Steps**        | 1. Run `testJiraConnection()` from the script editor                            |
| **Expected**     | Log shows `✅ Jira connection successful!` with your display name               |
| **Failure**      | 401 = wrong email/token. 404 = wrong base URL. Network error = URL unreachable. |

### TC-02: Project Issue Types

| Field            | Value                                                                         |
| ---------------- | ----------------------------------------------------------------------------- |
| **Function**     | `listProjectIssueTypes()`                                                     |
| **Purpose**      | Verify the configured issue type exists in the target project                 |
| **Precondition** | TC-01 passes. Config.gs has valid `JIRA_PROJECT_KEY`.                         |
| **Steps**        | 1. Run `listProjectIssueTypes()` from the script editor                       |
| **Expected**     | Log lists available issue types. `JIRA_ISSUE_TYPE` value appears in the list. |
| **Failure**      | 404 = wrong project key. Empty list = project has no issue types configured.  |

### TC-03: Jira User Lookup

| Field            | Value                                                             |
| ---------------- | ----------------------------------------------------------------- |
| **Function**     | `findJiraUser("Name")`                                            |
| **Purpose**      | Find Jira account IDs for assignee mapping                        |
| **Precondition** | TC-01 passes.                                                     |
| **Steps**        | 1. Edit the function call to use a real name. 2. Run it.          |
| **Expected**     | Log shows matching Jira users with their `accountId` values.      |
| **Failure**      | No results = user not found. Check spelling or try email instead. |

### TC-04: Drive Scanning

| Field            | Value                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Function**     | `scanForNewMeetingNotes()`                                                                                                      |
| **Purpose**      | Verify Drive search finds Gemini-style documents                                                                                |
| **Precondition** | A Google Doc exists with a title starting with "Notes from" or similar pattern, created within the last `LOOKBACK_HOURS`.       |
| **Steps**        | 1. Create a test doc (see Section 4). 2. Run `testPoll()`.                                                                      |
| **Expected**     | Log shows `[Scan] New meeting notes found: <doc title>` and the doc is processed.                                               |
| **Failure**      | `Found 0 unprocessed doc(s)` = doc title doesn't match patterns, doc is outside lookback window, or doc is in the wrong folder. |

### TC-05: Parser — Full Document

| Field            | Value                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Function**     | `testParserOnly()`                                                                                                     |
| **Purpose**      | Verify the parser correctly extracts sections and action items                                                         |
| **Precondition** | A Gemini-style meeting notes doc exists (real or simulated).                                                           |
| **Steps**        | 1. Set `docId` in `testParserOnly()` to a valid doc ID. 2. Run it.                                                     |
| **Expected**     | Log shows Summary text, Decisions with statuses, Next Steps with titles and assignees.                                 |
| **Failure**      | 0 action items = section headings don't match `CONFIG.SECTIONS` values, or headings aren't formatted as H1–H4 or bold. |

### TC-06: Parser — Assignee Detection

| Field            | Value                                                                               |
| ---------------- | ----------------------------------------------------------------------------------- |
| **Function**     | `testParserOnly()`                                                                  |
| **Purpose**      | Verify all 4 assignee patterns are detected                                         |
| **Precondition** | Test doc contains action items in these formats.                                    |
| **Test Data**    | Create a doc with these Next Steps items:                                           |
|                  | `• Review the proposal (John Smith)` — Pattern 1: parentheses                       |
|                  | `• Update the schema — Owner: Jane Doe` — Pattern 2: owner prefix                   |
|                  | `• Schedule follow-up by Michael Chen` — Pattern 3: "by" keyword                    |
|                  | `• Write the report - Sarah Wilson` — Pattern 4: dash separator                     |
|                  | `• Complete the setup` — No assignee                                                |
| **Expected**     | 5 action items extracted. First 4 have correct assignees. Last has `null` assignee. |

### TC-07: Ticket Creation — Single Item

| Field            | Value                                                                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function**     | `testWithDocId()`                                                                                                                                                                                  |
| **Purpose**      | Verify a Jira ticket is created from a single action item                                                                                                                                          |
| **Precondition** | TC-01 and TC-02 pass. Test doc has at least 1 action item.                                                                                                                                         |
| **Steps**        | 1. Set `docId` in `testWithDocId()`. 2. Run it.                                                                                                                                                    |
| **Expected**     | Log shows `✅ Created: SS-XXX`. Ticket appears in Jira with correct title, description (includes meeting link and summary), labels `meeting-action-item` and `gemini-notes`, and correct priority. |
| **Failure**      | 400 = bad payload (check issue type/project key). 401 = auth error. 403 = no permission to create issues.                                                                                          |

### TC-08: Ticket Creation — With Assignee

| Field            | Value                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function**     | `testWithDocId()`                                                                                                                           |
| **Purpose**      | Verify assignee mapping works end-to-end                                                                                                    |
| **Precondition** | `JIRA_ASSIGNEE_MAP` is configured with at least one mapping. Test doc has an action item assigned to a mapped name.                         |
| **Steps**        | 1. Add a mapping: `"john smith": "<account-id>"`. 2. Create a test doc with `• Review the proposal (John Smith)`. 3. Run `testWithDocId()`. |
| **Expected**     | Jira ticket is created and assigned to the mapped user.                                                                                     |
| **Failure**      | Ticket created but unassigned = name in doc doesn't match map key (case-insensitive).                                                       |

### TC-09: Deduplication

| Field              | Value                                                                                                                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function**       | `testWithDocId()` (run twice on same doc)                                                                                                                                                                                                                                           |
| **Purpose**        | Verify the same document is not processed twice                                                                                                                                                                                                                                     |
| **Steps**          | 1. Run `testWithDocId()` on a doc. 2. Note the tickets created. 3. Run `testWithDocId()` again on the same doc.                                                                                                                                                                     |
| **Expected**       | Second run creates 0 new tickets. Log shows `No action items found` or processes without creating duplicates (the `clearProcessedDoc` call in `testWithDocId` resets the flag, so this specifically tests the `markAsProcessed` → `isAlreadyProcessed` flow during normal polling). |
| **Adjusted Steps** | To test deduplication via polling: 1. Run `testPoll()` — doc is processed. 2. Run `testPoll()` again. 3. Second run should show `No new meeting notes found.`                                                                                                                       |

### TC-10: End-to-End Polling

| Field            | Value                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Function**     | `testPoll()`                                                                                                                |
| **Purpose**      | Verify the full polling pipeline works                                                                                      |
| **Precondition** | Trigger is installed. A new Gemini-style doc exists in the target folder (or anywhere in Drive if no folder is configured). |
| **Steps**        | 1. Create a test doc (Section 4). 2. Run `testPoll()`.                                                                      |
| **Expected**     | Log shows: scan finds 1 doc → parser extracts action items → tickets created → doc marked as processed.                     |
| **Failure**      | Check each stage: scan query, parser output, Jira API response.                                                             |

### TC-11: Email Notification

| Field            | Value                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Function**     | `testWithDocId()` with `NOTIFICATION_EMAIL` set                                                                               |
| **Purpose**      | Verify summary email is sent after processing                                                                                 |
| **Precondition** | `NOTIFICATION_EMAIL` is set to a valid email address.                                                                         |
| **Steps**        | 1. Set the email in Config.gs. 2. Run `testWithDocId()`.                                                                      |
| **Expected**     | Email received with subject `[gemini-meet-jira] X ticket(s) created from: <doc title>` containing ticket keys and any errors. |

### TC-12: Error Handling — Invalid Credentials

| Field        | Value                                                                              |
| ------------ | ---------------------------------------------------------------------------------- |
| **Function** | `testJiraConnection()`                                                             |
| **Purpose**  | Verify meaningful error messages on auth failure                                   |
| **Steps**    | 1. Temporarily set `JIRA_API_TOKEN` to `"invalid"`. 2. Run `testJiraConnection()`. |
| **Expected** | Log shows `Jira API returned 401` with clear error message.                        |
| **Cleanup**  | Restore the correct API token.                                                     |

### TC-13: Folder Restriction

| Field            | Value                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| **Function**     | `testPoll()`                                                                          |
| **Purpose**      | Verify only docs in the configured folder are processed                               |
| **Precondition** | `MEETING_NOTES_FOLDER_ID` is set.                                                     |
| **Steps**        | 1. Create a "Notes from Test" doc OUTSIDE the configured folder. 2. Run `testPoll()`. |
| **Expected**     | Doc is NOT found. Log shows `Found 0 unprocessed doc(s).`                             |

### TC-14: Debug Utilities

| Field         | Value                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Functions** | `listProcessedDocs()`, `clearProcessedDoc(id)`, `clearProcessedDocs()`                                                                                       |
| **Purpose**   | Verify deduplication records can be inspected and managed                                                                                                    |
| **Steps**     | 1. Process a doc. 2. Run `listProcessedDocs()` — should show the doc. 3. Run `clearProcessedDoc("<id>")`. 4. Run `listProcessedDocs()` — doc should be gone. |
| **Expected**  | Records are accurately listed, cleared individually, and cleared in bulk.                                                                                    |

---

## 4. Creating a Simulated Gemini Notes Doc

To test without holding a real meeting, create a Google Doc that mimics Gemini's output:

### Step 1 — Create the Document

1. Go to [docs.google.com](https://docs.google.com) and create a new document
2. Name it: **`Notes from Test Meeting - Feb 18, 2026`**
   - The title MUST start with `Notes from` (or another pattern listed in `GEMINI_NOTES_PATTERNS`)

### Step 2 — Add Content with Correct Formatting

Type the following content. **Headings must be formatted as Heading 1, 2, 3, or 4** (not just bold text):

---

**Summary** ← Format as Heading 2

The team discussed the upcoming product launch timeline and agreed on key milestones. The primary focus was on API readiness and QA testing schedules.

**Decisions** ← Format as Heading 2

- We will adopt the new authentication approach (Aligned)
- The launch date moves to Q2 (Disagreed)
- Mobile support is deferred to v2 (Aligned)

**Next Steps** ← Format as Heading 2

- Review the proposal document (John Smith)
- Update the API schema — Owner: Jane Doe
- Schedule follow-up meeting by Michael Chen
- Complete the QA test plan - Sarah Wilson
- Set up staging environment

**Details** ← Format as Heading 2

Extended discussion covered the authentication migration strategy. The team reviewed three approaches and selected JWT-based tokens for the API layer.

---

### Step 3 — Place in the Correct Folder (if configured)

If `MEETING_NOTES_FOLDER_ID` is set in Config.gs, move the document into that Google Drive folder.

### Step 4 — Get the Document ID

From the document URL: `https://docs.google.com/document/d/**THIS_IS_THE_ID**/edit`

Copy the ID between `/d/` and `/edit`.

---

## 5. Verification Checklist

Run through this checklist after deployment to confirm everything works:

- [ ] **TC-01**: `testJiraConnection()` shows "Jira connection successful"
- [ ] **TC-02**: `listProjectIssueTypes()` includes the configured issue type
- [ ] **TC-05**: `testParserOnly()` extracts sections and action items from a test doc
- [ ] **TC-07**: `testWithDocId()` creates tickets in Jira with correct title, description, labels, and priority
- [ ] **TC-10**: `testPoll()` finds and processes a new test document end-to-end
- [ ] **TC-09**: Running `testPoll()` a second time does NOT re-process the same doc
- [ ] **Step 6**: `installTrigger()` completes without errors
- [ ] **Step 7**: `listTriggers()` shows the `pollForMeetingNotes` trigger
- [ ] **Live test**: After a real Google Meet with Gemini notes, tickets appear within 5 minutes

---

## 6. Known Pitfalls

### Trailing Slash on JIRA_BASE_URL

`JIRA_BASE_URL` must NOT have a trailing slash. The script appends `/rest/api/3/...` to it.

| Setting                                     | Result                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `"https://company.atlassian.net"` (correct) | `https://company.atlassian.net/rest/api/3/issue`                                |
| `"https://company.atlassian.net/"` (wrong)  | `https://company.atlassian.net//rest/api/3/issue` — double slash, may cause 404 |

### Heading Formatting in Test Docs

The parser detects section boundaries by checking Google Docs paragraph heading styles (H1–H4). If you format headings as bold normal text, the parser uses a fallback that checks if the text matches a known section name AND is fully bold. Regular bold text that doesn't match section names will be ignored.

### Apps Script Execution Time Limit

Google Apps Script has a 6-minute execution limit per run. This is effectively unlimited for normal meetings (even with 50+ action items), but if you process many documents in a single poll cycle, you could hit the limit.

### everyMinutes() Valid Values

`ScriptApp.newTrigger().timeBased().everyMinutes()` only accepts: **1, 5, 10, 15, or 30**. Setting `POLL_INTERVAL_MINUTES` to other values (e.g. 3, 7, 20) will cause an error when installing the trigger.

### Gemini Notes May Not Appear Immediately

After a meeting ends, Gemini takes 1–2 minutes to generate the notes document. The polling trigger then needs to run (every 5 minutes by default), so the worst-case delay is approximately 7 minutes.

### Script Properties Quota

Google Apps Script limits Script Properties to 500KB total. Each processed doc record uses ~80 bytes. This allows tracking ~6,000 processed documents before hitting the limit. For very high-volume usage, periodically run `clearProcessedDocs()` to reset.

---

## 7. Rollback Procedure

### Stop the Automation

```javascript
// Run in Apps Script editor:
removeTrigger();
```

This immediately stops the polling trigger. No more documents will be processed.

### Verify Trigger Removal

```javascript
// Run in Apps Script editor:
listTriggers();
// Expected: "No triggers installed."
```

### Jira Tickets Already Created

Tickets that have already been created in Jira remain. They must be manually deleted or closed in Jira if needed. The script does not modify or delete previously created tickets.

### Re-enable After Fix

1. Fix the issue in Config.gs or the relevant script file
2. Run `testJiraConnection()` to verify
3. Run `installTrigger()` to restart polling
4. Run `testPoll()` to process any documents that were missed during downtime
