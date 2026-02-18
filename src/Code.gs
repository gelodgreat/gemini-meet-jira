/**
 * Code.gs - Main Entry Point and Trigger Management
 *
 * This is the heart of the Google Apps Script integration.
 *
 * How it works:
 *   1. After a Google Meet ends, Gemini automatically creates a "Notes from …"
 *      Google Doc in the organizer's Drive.
 *   2. A time-based trigger runs pollForMeetingNotes() every few minutes.
 *   3. scanForNewMeetingNotes() searches Drive for recent docs matching
 *      Gemini's naming patterns that haven't been processed yet.
 *   4. parseMeetingNotes() reads the doc structure and extracts action items
 *      from the "Next Steps" section.
 *   5. createJiraIssue() posts each action item to Jira via REST API.
 *   6. The document ID is stored in Script Properties so it is never processed twice.
 *
 * Quick start:
 *   1. Fill in src/Config.gs with your Jira credentials.
 *   2. Run testJiraConnection() to verify connectivity.
 *   3. Run installTrigger() to activate the automation.
 *   4. Hold a Google Meet with Gemini notes enabled — tickets appear in Jira!
 */

// ============================================================
// Trigger handler (called automatically by Google Apps Script)
// ============================================================

/**
 * Time-based trigger handler.
 *
 * Runs every CONFIG.POLL_INTERVAL_MINUTES minutes (default: 5).
 * Scans Google Drive for new Gemini meeting notes and processes any
 * that haven't been handled yet.
 *
 * NOTE: Do not rename this function — it must match the trigger
 * registration in installTrigger().
 */
function pollForMeetingNotes() {
  try {
    var fileIds = scanForNewMeetingNotes();

    if (fileIds.length === 0) {
      Logger.log("No new meeting notes found.");
      return;
    }

    Logger.log("Processing " + fileIds.length + " new meeting notes doc(s)...");

    for (var i = 0; i < fileIds.length; i++) {
      processMeetingNotes(fileIds[i]);
    }
  } catch (error) {
    handleError(error, "pollForMeetingNotes");
  }
}

// ============================================================
// Core processing
// ============================================================

/**
 * Process a Gemini meeting notes document and create Jira tickets
 * for each action item found in the "Next Steps" section.
 *
 * Can also be called manually (e.g. testWithDocId()) for one-off runs.
 *
 * @param {string} fileId - Google Drive ID of the meeting notes Google Doc
 * @returns {{ created: Array, errors: Array }}
 */
function processMeetingNotes(fileId) {
  Logger.log("=== processMeetingNotes START: " + fileId + " ===");

  var file = DriveApp.getFileById(fileId);
  var docTitle = file.getName();
  var docUrl = "https://docs.google.com/document/d/" + fileId + "/edit";

  Logger.log("Document: " + docTitle);

  // Parse the Gemini notes structure using the Docs Advanced Service
  // (DocumentApp.openById cannot handle Gemini's smart chips)
  var parsed = parseMeetingNotes(fileId);

  Logger.log(
    "Sections found — summary: " +
      (parsed.summary ? "yes" : "no") +
      ", decisions: " +
      parsed.decisions.length +
      ", nextSteps: " +
      parsed.nextSteps.length,
  );

  if (parsed.nextSteps.length === 0) {
    Logger.log("No action items found — nothing to create in Jira.");
    markAsProcessed(fileId);
    return { created: [], errors: [] };
  }

  var meetingContext = {
    meetingTitle: docTitle,
    summary: parsed.summary,
    docUrl: docUrl,
    meetingDate: file.getDateCreated(),
  };

  var created = [];
  var errors = [];

  // Create one Jira ticket per action item
  for (var i = 0; i < parsed.nextSteps.length; i++) {
    var actionItem = parsed.nextSteps[i];
    Logger.log(
      "Creating ticket [" +
        (i + 1) +
        "/" +
        parsed.nextSteps.length +
        "]: " +
        actionItem.title,
    );

    try {
      var result = createJiraIssue(actionItem, meetingContext);
      created.push(result);
      Logger.log("  ✅ Created: " + result.key + " → " + result.self);
    } catch (err) {
      Logger.log("  ❌ Failed: " + err.message);
      errors.push({ item: actionItem.title, error: err.message });
    }
  }

  // Mark this doc as done — prevents duplicate ticket creation on re-triggers
  markAsProcessed(fileId);

  // Optionally email a summary to the configured address
  if (CONFIG.NOTIFICATION_EMAIL) {
    sendNotificationEmail(docTitle, created, errors, docUrl);
  }

  Logger.log(
    "=== processMeetingNotes END: " +
      created.length +
      " created, " +
      errors.length +
      " failed ===",
  );

  return { created: created, errors: errors };
}

// ============================================================
// Trigger installation
// ============================================================

/**
 * Install the time-based polling trigger.
 *
 * Run this once from the Apps Script editor (Run → installTrigger).
 * You will be prompted to grant OAuth permissions on the first run.
 *
 * After installation, the script polls Drive every CONFIG.POLL_INTERVAL_MINUTES
 * minutes for new Gemini meeting notes. You do NOT need to run this again
 * unless you delete the trigger.
 */
function installTrigger() {
  // Remove any existing trigger to avoid duplicates
  removeTrigger();

  var interval = CONFIG.POLL_INTERVAL_MINUTES || 5;

  ScriptApp.newTrigger("pollForMeetingNotes")
    .timeBased()
    .everyMinutes(interval)
    .create();

  Logger.log("✅ Time-based trigger installed (every " + interval + " min).");
  Logger.log("   The script will now poll Drive for new Gemini meeting notes");
  Logger.log("   and create Jira tickets automatically.");
  Logger.log("   Run testJiraConnection() to verify your Jira credentials.");
}

/**
 * Remove the polling trigger.
 * Stops the automation without deleting the script itself.
 */
function removeTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;

  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "pollForMeetingNotes") {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  if (removed > 0) {
    Logger.log("Removed " + removed + " existing trigger(s).");
  }
}

/**
 * List all project triggers. Useful for verifying installation.
 */
function listTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  if (triggers.length === 0) {
    Logger.log("No triggers installed. Run installTrigger() to activate.");
    return;
  }

  Logger.log("Installed triggers (" + triggers.length + "):");
  triggers.forEach(function (t) {
    Logger.log(
      "  Handler: " +
        t.getHandlerFunction() +
        " | Type: " +
        t.getEventType() +
        " | Source: " +
        t.getTriggerSource(),
    );
  });
}

// ============================================================
// Testing utilities
// ============================================================

/**
 * Run the polling function manually (without waiting for the trigger).
 * Good for verifying the full pipeline end-to-end.
 */
function testPoll() {
  pollForMeetingNotes();
}

/**
 * Manually process a specific Google Doc by its ID.
 *
 * Use this to test the script without waiting for a real meeting.
 * Paste a Gemini meeting notes doc ID below and run this function.
 */
function testWithDocId() {
  // Replace this with the ID of an actual Gemini meeting notes Google Doc.
  // Find it in the URL: https://docs.google.com/document/d/THIS_IS_THE_ID/edit
  var docId = "PASTE_YOUR_DOC_ID_HERE";

  if (docId === "PASTE_YOUR_DOC_ID_HERE") {
    Logger.log(
      "⚠️  Update the docId variable in testWithDocId() before running.",
    );
    return;
  }

  // Clear the processed flag for this doc so it can be re-processed
  clearProcessedDoc(docId);

  var result = processMeetingNotes(docId);
  Logger.log("Result: " + JSON.stringify(result, null, 2));
}

/**
 * Parse a specific document and log what the parser finds,
 * WITHOUT creating any Jira tickets. Good for debugging the parser.
 */
function testParserOnly() {
  var docId = "PASTE_YOUR_DOC_ID_HERE";

  if (docId === "PASTE_YOUR_DOC_ID_HERE") {
    Logger.log(
      "⚠️  Update the docId variable in testParserOnly() before running.",
    );
    return;
  }

  var parsed = parseMeetingNotes(docId);

  Logger.log("=== Parser Output ===");
  Logger.log(
    "Summary: " +
      (parsed.summary ? parsed.summary.substring(0, 200) : "(none)") +
      "...",
  );
  Logger.log("Decisions (" + parsed.decisions.length + "):");
  parsed.decisions.forEach(function (d) {
    Logger.log("  [" + d.status + "] " + d.text);
  });
  Logger.log("Next Steps (" + parsed.nextSteps.length + "):");
  parsed.nextSteps.forEach(function (item, idx) {
    Logger.log(
      "  " +
        (idx + 1) +
        ". " +
        item.title +
        (item.assignee ? " → " + item.assignee : "") +
        (item.details ? " [" + item.details + "]" : ""),
    );
  });
}

// ============================================================
// Error handling and notifications
// ============================================================

/**
 * Central error handler. Logs the error and optionally sends an email.
 *
 * @param {Error} error
 * @param {string} context - Name of the calling function for log context
 */
function handleError(error, context) {
  var msg =
    "[gemini-meet-jira] Error in " +
    context +
    ": " +
    error.message +
    (error.stack ? "\n" + error.stack : "");
  Logger.log(msg);

  if (CONFIG.NOTIFICATION_EMAIL) {
    try {
      GmailApp.sendEmail(
        CONFIG.NOTIFICATION_EMAIL,
        "[gemini-meet-jira] Script Error",
        msg,
      );
    } catch (emailErr) {
      Logger.log("Could not send error email: " + emailErr.message);
    }
  }
}

/**
 * Send a summary email after processing a meeting notes document.
 *
 * @param {string} meetingTitle - Name of the meeting notes doc
 * @param {Array} created - Jira issues that were successfully created
 * @param {Array} errors - Action items that failed with error messages
 * @param {string} docUrl - URL to the source Google Doc
 */
function sendNotificationEmail(meetingTitle, created, errors, docUrl) {
  var subject =
    "[gemini-meet-jira] " +
    created.length +
    " ticket(s) created from: " +
    meetingTitle;

  var lines = ["Meeting notes processed: " + docUrl, ""];

  if (created.length > 0) {
    lines.push("✅ Created " + created.length + " Jira ticket(s):");
    created.forEach(function (ticket) {
      lines.push("   " + ticket.key + " — " + ticket.self);
    });
  }

  if (errors.length > 0) {
    lines.push("");
    lines.push("❌ Failed to create " + errors.length + " ticket(s):");
    errors.forEach(function (e) {
      lines.push("   • " + e.item + ": " + e.error);
    });
  }

  try {
    GmailApp.sendEmail(CONFIG.NOTIFICATION_EMAIL, subject, lines.join("\n"));
  } catch (e) {
    Logger.log("Could not send notification email: " + e.message);
  }
}
