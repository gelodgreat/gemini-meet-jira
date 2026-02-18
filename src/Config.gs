/**
 * Config.gs - User Configuration
 *
 * Edit this file with your Jira credentials and preferences BEFORE
 * installing the trigger. All required fields are marked with (Required).
 *
 * Setup guide: see README.md
 */

var CONFIG = {
  // ============================================================
  // JIRA CONFIGURATION (Required)
  // ============================================================

  // Your Jira Cloud base URL — no trailing slash
  // Example: "https://mycompany.atlassian.net"
  JIRA_BASE_URL: "https://propapp.atlassian.net",

  // Your Atlassian account email (the one you use to log into Jira)
  JIRA_EMAIL: "angelo@propapp.com.au",

  // Jira API Token
  // Generate one at: https://id.atlassian.com/manage-profile/security/api-tokens
  JIRA_API_TOKEN:
    "",

  // Jira project key — the prefix shown in issue keys (e.g. PROJ-123)
  // Find it in Jira: Project Settings → Details → Key
  JIRA_PROJECT_KEY: "SS",

  // Issue type to create for each action item
  // Common values: "Task", "Story", "Bug", "Sub-task"
  // Run listProjectIssueTypes() in the script editor to see available types
  JIRA_ISSUE_TYPE: "Task",

  // Default priority assigned to auto-created tickets
  // Options: "Highest", "High", "Medium", "Low", "Lowest"
  JIRA_DEFAULT_PRIORITY: "Medium",

  // ============================================================
  // ASSIGNEE MAPPING (Optional)
  // ============================================================
  // Maps attendee names from Gemini notes to Jira account IDs.
  // Keys must be lowercase versions of the name as it appears in meeting notes.
  //
  // To find a Jira account ID, call:
  //   GET https://your-domain.atlassian.net/rest/api/3/user/search?query=Name
  // and look for "accountId" in the response.
  //
  // Example:
  //   "john smith": "5b10a2844c20165700ede21g",
  //   "jane doe":   "5b109f2e9729b51b54dc274d",
  JIRA_ASSIGNEE_MAP: {
    // "name as written in notes": "atlassian-account-id",
  },

  // ============================================================
  // DETECTION SETTINGS (Optional)
  // ============================================================

  // Restrict monitoring to a specific Google Drive folder.
  // Leave empty ("") to monitor all of your Drive for Gemini meeting notes.
  //
  // To find a folder ID: open the folder in Drive — the ID is the last
  // segment of the URL:
  //   https://drive.google.com/drive/folders/1Q8olAPPCuO9eYzsCoXHTDRtxNzPimzHV
  MEETING_NOTES_FOLDER_ID: "",

  // ============================================================
  // POLLING SETTINGS (Optional)
  // ============================================================

  // How often the script checks for new meeting notes (in minutes).
  // Lower = faster detection but more quota usage. Minimum: 1, Maximum: 60.
  POLL_INTERVAL_MINUTES: 5,

  // How far back (in hours) to search for new meeting notes each poll cycle.
  // Keeps queries efficient. 24 hours is generous; reduce if quota is a concern.
  LOOKBACK_HOURS: 24,

  // ============================================================
  // NOTIFICATION SETTINGS (Optional)
  // ============================================================

  // Email address to receive a summary after each meeting is processed.
  // Leave empty ("") to disable email notifications.
  NOTIFICATION_EMAIL: "",

  // ============================================================
  // SECTION NAMES
  // These match the headings Gemini uses in meeting notes.
  // Gemini varies the heading text across meeting types, so each
  // section supports multiple aliases. The first value is the
  // canonical name used internally.
  // ============================================================
  SECTIONS: {
    SUMMARY: ["Summary"],
    DECISIONS: ["Decisions"],
    NEXT_STEPS: ["Next Steps", "Suggested next steps", "Action items"],
    DETAILS: ["Details"],
  },
};
