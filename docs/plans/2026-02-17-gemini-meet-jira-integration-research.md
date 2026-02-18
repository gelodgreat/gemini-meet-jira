# Google Meet + Jira Integration Research

**Date**: 2026-02-17
**Status**: Research Phase
**Objective**: Understand how to create Jira tickets from Google Meet meetings using Gemini's meeting summaries

---

## Executive Summary

There is **no native integration** between Google Meet's Gemini notes and Jira. All solutions require third-party tools or custom development. However, the building blocks exist and the ecosystem offers several viable paths — from plug-and-play SaaS tools to fully custom API-driven solutions.

---

## Part 1: How Gemini Meeting Notes Work

### What Gemini Generates

When "Take notes for me" is enabled in Google Meet, Gemini produces a structured Google Doc with:

| Section        | Description                                               | Language Support |
| -------------- | --------------------------------------------------------- | ---------------- |
| **Summary**    | High-level overview of the meeting                        | 9 languages      |
| **Decisions**  | Tracked decisions with status (Aligned/Disagreed/Shelved) | English only     |
| **Next Steps** | Action items with assignees extracted from conversation   | 9 languages      |
| **Details**    | Extended discussion breakdown by topic                    | 9 languages      |

It also provides a real-time "Summary so far" feature for latecomers during the meeting.

### Where Notes Are Saved

- Saved as a **Google Doc** in the **meeting organizer's Google Drive**
- Automatically attached to the **Google Calendar event**
- Shared with all **internal meeting invitees**
- Host and co-hosts receive **email summaries**
- Save folder is **not customizable**

### Requirements & Limitations

| Requirement           | Details                                                                            |
| --------------------- | ---------------------------------------------------------------------------------- |
| **Workspace Plan**    | Business Standard ($16.80/user/mo) or higher. Business Starter does NOT include it |
| **Languages**         | 9 only: English, French, German, Italian, Japanese, Korean, Portuguese, Spanish    |
| **Decisions Section** | English only                                                                       |
| **Meeting Length**    | 15 minutes to 8 hours                                                              |
| **Platform**          | Desktop only (no mobile)                                                           |
| **Meeting Platform**  | Google Meet only (no Zoom/Teams)                                                   |
| **Multilingual**      | One language per meeting (no auto-detection switching)                             |
| **Accuracy**          | Varies with audio quality, accents, technical jargon                               |
| **External Tools**    | No native integrations with any project management tool                            |

---

## Part 2: Integration Approaches

### Approach 1: AI Meeting Assistants (Plug & Play)

These tools join your Google Meet as a bot, transcribe everything, extract action items, and push to Jira. They **replace** Gemini's notes with their own system.

| Tool             | Auto-Creates Jira Tickets                     | Transcription | Free Tier           | Paid From    | Key Strength                                                       |
| ---------------- | --------------------------------------------- | ------------- | ------------------- | ------------ | ------------------------------------------------------------------ |
| **tl;dv**        | Yes (auto-trigger on detected bugs/to-dos)    | Yes           | Yes (limited AI)    | ~$18/mo      | Best free tier, auto-detection                                     |
| **Fellow**       | Semi-auto (action items → issues, 2-way sync) | Yes           | No                  | $15/user/mo  | 2-way Jira sync (titles, assignees, due dates, status transitions) |
| **Fireflies.ai** | Yes (auto-sync after meetings)                | Yes           | Yes (20 AI credits) | ~$24/user/mo | Rich search across all past meetings                               |
| **Read.ai**      | Manual (1-click from action items)            | Yes           | Unknown             | Paid plans   | Clean UX, simple workflow                                          |
| **Avoma**        | Yes (auto-convert action items)               | Yes           | No                  | ~$20/user/mo | Revenue intelligence features                                      |

**Pros**: Minimal setup, works immediately, handles transcription + Jira creation in one tool
**Cons**: Replaces Gemini (doesn't use Gemini's output), adds a bot to your meeting, subscription costs, data leaves Google ecosystem

**Best for**: Teams that want a turnkey solution and don't mind a meeting bot.

---

### Approach 2: Automation Platforms (Low-Code)

Use Zapier, Make, or n8n to detect when Gemini creates meeting notes, then process and push to Jira.

**Key limitation**: No platform has a direct "Gemini notes created" trigger. The workaround is using **Google Drive "New File in Folder"** as the trigger, then filtering for meeting note documents.

| Platform   | Cost                               | Trigger Strategy                           | Jira Support | Key Strength                                                               |
| ---------- | ---------------------------------- | ------------------------------------------ | ------------ | -------------------------------------------------------------------------- |
| **Zapier** | Free (100 tasks/mo) to $49/mo      | Google Drive new file → filter → Jira      | Native       | Largest app ecosystem                                                      |
| **Make**   | Free (1,000 ops/mo) to $16/mo      | Google Drive watch → filter → Jira         | Native       | Visual builder, more granular                                              |
| **n8n**    | Free (self-hosted) or $20/mo cloud | Google Drive trigger → Gemini parse → Jira | Native       | Open-source, self-hostable, has pre-built template for this exact use case |

#### n8n Pre-Built Workflow

n8n has a specific template: **"Transform meeting notes into action items with Gemini & Google Workspace"** that:

1. Detects new meeting notes in Drive
2. Reads the Google Doc content
3. Uses Gemini AI to extract structured action items
4. Can be extended to create Jira tickets

**Pipeline flow**:

```
Google Drive (new doc trigger)
  → Google Docs API (read content)
    → Gemini AI (extract action items, assignees, priorities)
      → Jira API (create tickets with extracted data)
```

**Pros**: Uses Gemini's actual meeting notes, no meeting bot, customizable logic
**Cons**: Indirect trigger (Drive file watcher), requires configuration, may need Gemini API call to parse notes into structured data

**Best for**: Teams that want to use Gemini's native notes and have some technical comfort.

---

### Approach 3: Google Apps Script (Free, Medium Effort)

A Google Apps Script that monitors for new Gemini meeting docs and pushes to Jira.

**How it works**:

1. **Calendar trigger** or **Drive trigger** detects new meeting notes document
2. Script reads the Google Doc content via `DocumentApp`
3. Parses the "Next Steps" section for action items
4. Calls Jira REST API via `UrlFetchApp` to create tickets

**Pros**: Completely free, stays within Google ecosystem, no external tools, full customization
**Cons**: Requires scripting knowledge, needs maintenance, no visual builder, limited error handling

**Best for**: Technical teams comfortable with JavaScript who want a free, in-house solution.

---

### Approach 4: Custom API Integration (Full Control)

Build a custom application using official APIs.

**APIs available**:

| API                             | Purpose                                      | Status                   |
| ------------------------------- | -------------------------------------------- | ------------------------ |
| **Google Meet REST API v2beta** | Access Smart Notes resource (`smartNotes`)   | Developer Preview (beta) |
| **Google Docs API**             | Read the full meeting notes document content | GA (stable)              |
| **Google Calendar API**         | Detect meetings, get event metadata          | GA (stable)              |
| **Google Drive API**            | Watch for new meeting note files             | GA (stable)              |
| **Jira REST API v3**            | `POST /rest/api/3/issue` to create tickets   | GA (stable)              |
| **Gemini API** (optional)       | Additional AI processing on notes            | GA                       |

**Smart Notes API endpoint** (v2beta):

```
GET  https://meet.googleapis.com/v2beta/conferenceRecords/{id}/smartNotes/{id}
LIST https://meet.googleapis.com/v2beta/conferenceRecords/{id}/smartNotes
```

The `smartNotes` resource provides a `DocsDestination.document` field containing the Google Docs `documentId`. The resource also has a `State` field (`STARTED` / `ENDED` / `FILE_GENERATED`) for polling.

**Architecture**:

```
Google Meet (meeting ends)
  → Meet API webhook or Calendar event trigger
    → Smart Notes API (get documentId, poll for FILE_GENERATED state)
      → Google Docs API (read structured content)
        → LLM / Gemini API (extract action items, classify priority, assign)
          → Jira REST API (create issues with project, type, priority, assignee)
```

**Pros**: Maximum control, uses Gemini's native output, can add custom AI processing, no subscription costs beyond hosting
**Cons**: Most complex to build, Meet Smart Notes API is beta (may change), requires hosting and maintenance

**Best for**: Teams building a product or needing deep customization.

---

### Approach 5: Chrome Extensions (Manual, Quick)

Browser extensions that let you manually create Jira tickets while in a Meet call.

| Extension                    | How It Works                                        | Automation Level |
| ---------------------------- | --------------------------------------------------- | ---------------- |
| **GTJ (Google to Jira)**     | AI-powered, converts meetings/emails to Jira issues | Semi-automatic   |
| **Jira Extension in Chrome** | Create Jira ticket from any web page                | Manual           |
| **Fellow Chrome Extension**  | AI notes in Meet with Jira sync for action items    | Semi-automatic   |

**Pros**: Zero setup, works immediately
**Cons**: Manual effort, no automation, doesn't leverage Gemini's structured notes

**Best for**: Individual users who need a quick solution right now.

---

## Part 3: Comparison Matrix

| Criteria                 | AI Assistants            | Automation Platforms | Apps Script     | Custom API       | Chrome Extensions |
| ------------------------ | ------------------------ | -------------------- | --------------- | ---------------- | ----------------- |
| **Uses Gemini Notes**    | No (replaces them)       | Yes                  | Yes             | Yes              | No                |
| **Setup Time**           | Minutes                  | Hours                | Hours-Days      | Days-Weeks       | Minutes           |
| **Technical Skill**      | None                     | Low-Medium           | Medium          | High             | None              |
| **Cost**                 | $15-24/user/mo           | Free-$49/mo          | Free            | Hosting only     | Free-Paid         |
| **Automation Level**     | High                     | High                 | High            | Highest          | Low               |
| **Maintenance**          | None (SaaS)              | Low                  | Medium          | High             | None              |
| **Data Privacy**         | Data leaves Google       | Depends on platform  | Stays in Google | Full control     | Depends           |
| **Customization**        | Low                      | Medium               | High            | Highest          | None              |
| **Meeting Bot Required** | Yes                      | No                   | No              | No               | No                |
| **Reliability**          | High (established tools) | High                 | Medium          | Depends on build | High              |

---

## Part 4: Recommended Paths

### Path A: Fastest to Value (No Gemini dependency)

**Tool**: tl;dv or Fellow

- Sign up → connect Google Meet → connect Jira → done
- Action items auto-detected and pushed to Jira
- Trade-off: Replaces Gemini notes, adds a bot to meetings

### Path B: Uses Gemini Notes, Low Effort

**Tool**: n8n (self-hosted or cloud) with pre-built template

- Deploy n8n → configure Google Drive trigger → add Gemini parsing step → connect Jira
- Leverages Gemini's native meeting summaries
- Trade-off: Indirect trigger via Drive file watcher, some config needed

### Path C: Uses Gemini Notes, Zero Cost

**Tool**: Google Apps Script

- Write a script → attach to Calendar/Drive trigger → parse notes → call Jira API
- Completely free, stays within Google ecosystem
- Trade-off: Requires JavaScript knowledge, manual maintenance

### Path D: Maximum Control, Future-Proof

**Tool**: Custom app with Meet Smart Notes API + Jira API

- Build a service that listens for meeting events → fetches Gemini notes via API → creates Jira tickets
- Full control over logic, formatting, and routing
- Trade-off: Meet Smart Notes API is in beta, highest development effort

---

## Part 5: Open Questions for Decision Phase

1. Does the team already use Gemini's "Take notes for me" feature, or is this new?
2. What Google Workspace plan is the team on? (Business Standard+ required for Gemini notes)
3. Is having a bot in the meeting acceptable, or is a bot-free solution preferred?
4. How important is it to use Gemini's native output vs. a third-party transcription?
5. What's the Jira project structure? (Which project, issue types, required fields)
6. Who should be the default assignee for auto-created tickets?
7. Is there a preference for self-hosted vs. SaaS solutions?
8. What's the team size? (Affects pricing for per-user SaaS tools)

---

## Sources

- [Google Meet Help - Take notes for me](https://support.google.com/meet/answer/14754931)
- [Google Meet REST API - Smart Notes](https://developers.google.com/workspace/meet/api/guides/artifacts)
- [Google Workspace AI Note Taking](https://workspace.google.com/solutions/ai/ai-note-taking/)
- [n8n - Transform meeting notes with Gemini](https://n8n.io/workflows/5904-transform-meeting-notes-into-action-items-with-gemini-and-google-workspace/)
- [tl;dv Google Meet to Jira](https://tldv.io/google-meet-jira-integration/)
- [Fellow Jira Integration](https://fellow.ai/integrations/jira)
- [Fireflies.ai Jira Integration](https://fireflies.ai/blog/fireflies-jira-integration-supercharge-project-management/)
- [Zapier - Jira + Google Meet](https://zapier.com/apps/jira-software-cloud/integrations/google-meet)
- [Google Workspace Pricing](https://workspace.google.com/pricing)
- [Google Meet Supported Languages](https://support.google.com/meet/answer/14925782)
- [Start That Call - Atlassian Marketplace](https://marketplace.atlassian.com/apps/1236910/start-that-call-google-meet-integration-for-jira)
- [Relay.app - Google Gemini to Jira](https://www.relay.app/apps/google-gemini/integrations/jira)
