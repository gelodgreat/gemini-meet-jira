/**
 * DriveWatcher.gs - File Detection and Deduplication
 *
 * Detects when a new Gemini meeting notes document appears in Google Drive
 * and prevents the same document from being processed more than once.
 */

// Known filename patterns that Gemini uses for meeting notes.
// Gemini names docs like:
//   "Notes from My Meeting - Jan 17, 2026"
//   "Weekly Showcase - 2026/02/18 14:15 AEDT - Notes by Gemini"
var GEMINI_NOTES_PATTERNS = [
  /^Notes from /i,
  /^Meeting notes for /i,
  /^Meeting notes[-:]/i,
  /^Notes for /i,
  /^AI notes from /i,
  /- Notes by Gemini$/i,
];

// Script Properties key prefix for deduplication records.
var PROCESSED_KEY_PREFIX = "processed_";

/**
 * Scan Google Drive for recent Gemini meeting notes that haven't been
 * processed yet. Called by the time-based polling trigger.
 *
 * Uses DriveApp.searchFiles() with title filters matching known Gemini
 * naming patterns and a date cutoff to keep queries efficient.
 *
 * @returns {string[]} Array of unprocessed file IDs to handle
 */
function scanForNewMeetingNotes() {
  var cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - CONFIG.LOOKBACK_HOURS);
  var cutoffISO = cutoff.toISOString();

  // Build Drive search query — Google Docs created/modified after the cutoff
  // that have a title matching one of the known Gemini patterns.
  var titleFilters = [
    "title contains 'Notes from'",
    "title contains 'Meeting notes'",
    "title contains 'AI notes from'",
    "title contains 'Notes for'",
    "title contains 'Notes by Gemini'",
  ];

  var query =
    "mimeType = 'application/vnd.google-apps.document'" +
    " and modifiedDate > '" +
    cutoffISO +
    "'" +
    " and trashed = false" +
    " and (" +
    titleFilters.join(" or ") +
    ")";

  // If a specific folder is configured, restrict the search
  if (CONFIG.MEETING_NOTES_FOLDER_ID) {
    query += " and '" + CONFIG.MEETING_NOTES_FOLDER_ID + "' in parents";
  }

  Logger.log("[Scan] Query: " + query);

  var fileIds = [];
  try {
    var files = DriveApp.searchFiles(query);
    while (files.hasNext()) {
      var file = files.next();
      var id = file.getId();

      if (!isAlreadyProcessed(id)) {
        Logger.log("[Scan] New meeting notes found: " + file.getName());
        fileIds.push(id);
      }
    }
  } catch (e) {
    Logger.log("[Scan] Error searching Drive: " + e.message);
  }

  Logger.log("[Scan] Found " + fileIds.length + " unprocessed doc(s).");
  return fileIds;
}

/**
 * Returns true if the given Drive file ID looks like a Gemini meeting notes doc.
 *
 * Checks:
 *   1. The file must be a Google Doc (not a Sheet, PDF, etc.)
 *   2. The filename must match one of GEMINI_NOTES_PATTERNS, OR
 *      the file must live inside CONFIG.MEETING_NOTES_FOLDER_ID (if set).
 *
 * @param {string} fileId - Google Drive file ID
 * @returns {boolean}
 */
function isGeminiMeetingNotes(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);

    // Must be a Google Doc
    if (file.getMimeType() !== "application/vnd.google-apps.document") {
      return false;
    }

    var fileName = file.getName();

    // Check against known naming patterns
    for (var i = 0; i < GEMINI_NOTES_PATTERNS.length; i++) {
      if (GEMINI_NOTES_PATTERNS[i].test(fileName)) {
        Logger.log("Detected Gemini meeting notes by filename: " + fileName);
        return true;
      }
    }

    // If a specific folder is configured, accept any Google Doc in that folder
    if (CONFIG.MEETING_NOTES_FOLDER_ID) {
      var parents = file.getParents();
      while (parents.hasNext()) {
        var parent = parents.next();
        if (parent.getId() === CONFIG.MEETING_NOTES_FOLDER_ID) {
          Logger.log("Detected meeting notes by folder match: " + fileName);
          return true;
        }
      }
    }

    return false;
  } catch (e) {
    Logger.log(
      "isGeminiMeetingNotes error for fileId " + fileId + ": " + e.message,
    );
    return false;
  }
}

/**
 * Returns true if this document has already been processed.
 * Uses Script Properties for persistence across trigger invocations.
 *
 * @param {string} fileId - Google Drive file ID
 * @returns {boolean}
 */
function isAlreadyProcessed(fileId) {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty(PROCESSED_KEY_PREFIX + fileId) !== null;
}

/**
 * Marks a document as processed so it is not picked up again.
 * Stores the timestamp of when it was processed.
 *
 * @param {string} fileId - Google Drive file ID
 */
function markAsProcessed(fileId) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROCESSED_KEY_PREFIX + fileId, new Date().toISOString());
  Logger.log("Marked as processed: " + fileId);
}

/**
 * Lists all documents that have been processed.
 * Useful for debugging. Run this from the Apps Script editor.
 *
 * @returns {Array<{fileId: string, processedAt: string}>}
 */
function listProcessedDocs() {
  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();
  var results = [];

  for (var key in allProps) {
    if (key.indexOf(PROCESSED_KEY_PREFIX) === 0) {
      results.push({
        fileId: key.replace(PROCESSED_KEY_PREFIX, ""),
        processedAt: allProps[key],
      });
    }
  }

  Logger.log("Processed docs (" + results.length + "):");
  results.forEach(function (r) {
    Logger.log("  " + r.fileId + " at " + r.processedAt);
  });

  return results;
}

/**
 * Clears all processed-doc deduplication records.
 * Use this if you want to re-process a document (e.g. during testing).
 * WARNING: will allow all previously-seen docs to be re-processed.
 */
function clearProcessedDocs() {
  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();
  var count = 0;

  for (var key in allProps) {
    if (key.indexOf(PROCESSED_KEY_PREFIX) === 0) {
      props.deleteProperty(key);
      count++;
    }
  }

  Logger.log("Cleared " + count + " processed doc record(s).");
}

/**
 * Clears the processed record for a single document.
 * Allows that specific document to be re-processed.
 *
 * @param {string} fileId - Google Drive file ID
 */
function clearProcessedDoc(fileId) {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROCESSED_KEY_PREFIX + fileId);
  Logger.log("Cleared processed record for: " + fileId);
}
