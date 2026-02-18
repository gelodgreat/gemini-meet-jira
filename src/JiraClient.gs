/**
 * JiraClient.gs - Jira REST API Integration
 *
 * Handles authenticated HTTP calls to Jira Cloud REST API v3 and
 * builds issue payloads in Atlassian Document Format (ADF).
 */

/**
 * Create a single Jira issue from a parsed action item and meeting context.
 *
 * @param {{ title: string, assignee: string|null, details: string }} actionItem
 * @param {{ meetingTitle: string, summary: string, docUrl: string, meetingDate: Date }} meetingContext
 * @returns {{ key: string, id: string, self: string }}
 * @throws {Error} if Jira returns a non-201 status
 */
function createJiraIssue(actionItem, meetingContext) {
  var payload = buildJiraPayload(actionItem, meetingContext);
  var response = callJiraAPI("/rest/api/3/issue", "POST", payload);
  var statusCode = response.getResponseCode();

  if (statusCode !== 201) {
    throw new Error(
      "Jira API returned " + statusCode + ": " + response.getContentText(),
    );
  }

  var data = JSON.parse(response.getContentText());
  return {
    key: data.key,
    id: data.id,
    self: CONFIG.JIRA_BASE_URL + "/browse/" + data.key,
  };
}

/**
 * Build the Jira issue creation payload using Atlassian Document Format (ADF)
 * for the description field. ADF is required for Jira Cloud REST API v3.
 *
 * Description includes:
 *   - Action item detail text (if any)
 *   - Info panel with meeting title, date, and a link to the notes doc
 *   - Collapsible expand block with the meeting summary
 *
 * @param {{ title: string, assignee: string|null, details: string }} actionItem
 * @param {{ meetingTitle: string, summary: string, docUrl: string, meetingDate: Date }} meetingContext
 * @returns {Object} Jira REST API request body
 */
function buildJiraPayload(actionItem, meetingContext) {
  var descriptionContent = [];

  // 1. Action item details (if the parser captured extra text)
  if (actionItem.details && actionItem.details.trim()) {
    descriptionContent.push({
      type: "paragraph",
      content: [{ type: "text", text: actionItem.details.trim() }],
    });
  }

  // 2. Meeting source info panel
  var dateString = meetingContext.meetingDate
    ? new Date(meetingContext.meetingDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unknown date";

  descriptionContent.push({
    type: "panel",
    attrs: { panelType: "info" },
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "📋 Auto-created from meeting notes",
            marks: [{ type: "strong" }],
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Meeting: ", marks: [{ type: "strong" }] },
          { type: "text", text: meetingContext.meetingTitle },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Date: ", marks: [{ type: "strong" }] },
          { type: "text", text: dateString },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Notes: ", marks: [{ type: "strong" }] },
          {
            type: "text",
            text: meetingContext.docUrl,
            marks: [
              {
                type: "link",
                attrs: { href: meetingContext.docUrl },
              },
            ],
          },
        ],
      },
    ],
  });

  // 3. Collapsible meeting summary (keeps the ticket clean but context available)
  if (meetingContext.summary && meetingContext.summary.trim()) {
    descriptionContent.push({
      type: "expand",
      attrs: { title: "Meeting Summary" },
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: meetingContext.summary.trim() }],
        },
      ],
    });
  }

  var payload = {
    fields: {
      project: { key: CONFIG.JIRA_PROJECT_KEY },
      issuetype: { name: CONFIG.JIRA_ISSUE_TYPE },
      summary: actionItem.title,
      description: {
        type: "doc",
        version: 1,
        content: descriptionContent,
      },
      priority: { name: CONFIG.JIRA_DEFAULT_PRIORITY },
      labels: ["meeting-action-item", "gemini-notes"],
    },
  };

  // Resolve assignee via the name→accountId map in Config.gs
  if (actionItem.assignee && CONFIG.JIRA_ASSIGNEE_MAP) {
    var lookupKey = actionItem.assignee.toLowerCase();
    var accountId = CONFIG.JIRA_ASSIGNEE_MAP[lookupKey];
    if (accountId) {
      payload.fields.assignee = { accountId: accountId };
      Logger.log(
        "Assignee resolved: " + actionItem.assignee + " → " + accountId,
      );
    } else {
      Logger.log(
        "No Jira account ID mapping for assignee: " + actionItem.assignee,
      );
    }
  }

  return payload;
}

/**
 * Make an authenticated HTTP request to the Jira REST API.
 * Uses HTTP Basic Authentication (email:apiToken base64-encoded).
 *
 * @param {string} endpoint - API path, e.g. "/rest/api/3/issue"
 * @param {string} method   - HTTP method: "GET", "POST", "PUT"
 * @param {Object|null} payload - JSON request body (omit for GET)
 * @returns {GoogleAppsScript.URL_Fetch.HTTPResponse}
 */
function callJiraAPI(endpoint, method, payload) {
  var credentials = Utilities.base64Encode(
    CONFIG.JIRA_EMAIL + ":" + CONFIG.JIRA_API_TOKEN,
  );

  var options = {
    method: method.toLowerCase(),
    headers: {
      Authorization: "Basic " + credentials,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    muteHttpExceptions: true, // prevents Apps Script from throwing on 4xx/5xx
  };

  if (payload) {
    options.payload = JSON.stringify(payload);
  }

  var url = CONFIG.JIRA_BASE_URL + endpoint;
  Logger.log("[Jira] " + method + " " + url);

  var response = UrlFetchApp.fetch(url, options);
  Logger.log("[Jira] Response: " + response.getResponseCode());

  return response;
}

// ============================================================
// Utility / Debugging Functions
// ============================================================

/**
 * Test your Jira credentials and connectivity.
 * Run this from the Apps Script editor BEFORE installing the trigger.
 */
function testJiraConnection() {
  var response = callJiraAPI("/rest/api/3/myself", "GET", null);

  if (response.getResponseCode() === 200) {
    var user = JSON.parse(response.getContentText());
    Logger.log("✅ Jira connection successful!");
    Logger.log("   Connected as: " + user.displayName);
    Logger.log("   Email: " + user.emailAddress);
    Logger.log("   Account ID: " + user.accountId);
  } else {
    Logger.log(
      "❌ Jira connection failed (HTTP " + response.getResponseCode() + ")",
    );
    Logger.log(response.getContentText());
  }
}

/**
 * List all issue types available in the configured project.
 * Useful for finding the exact name to put in CONFIG.JIRA_ISSUE_TYPE.
 */
function listProjectIssueTypes() {
  var response = callJiraAPI(
    "/rest/api/3/project/" + CONFIG.JIRA_PROJECT_KEY,
    "GET",
    null,
  );

  if (response.getResponseCode() !== 200) {
    Logger.log(
      "❌ Could not fetch project (HTTP " + response.getResponseCode() + ")",
    );
    Logger.log(response.getContentText());
    return;
  }

  var project = JSON.parse(response.getContentText());
  Logger.log("Project: " + project.name + " (" + project.key + ")");
  Logger.log("Available issue types:");
  project.issueTypes.forEach(function (type) {
    Logger.log("  • " + type.name + (type.subtask ? " (sub-task)" : ""));
  });

  return project.issueTypes;
}

/**
 * Search Jira users by display name to find their account ID.
 * Use this to fill in CONFIG.JIRA_ASSIGNEE_MAP.
 *
 * @param {string} query - Name or email to search for
 */
function findJiraUser(query) {
  var response = callJiraAPI(
    "/rest/api/3/user/search?query=" + encodeURIComponent(query),
    "GET",
    null,
  );

  if (response.getResponseCode() !== 200) {
    Logger.log(
      "❌ User search failed (HTTP " + response.getResponseCode() + ")",
    );
    return;
  }

  var users = JSON.parse(response.getContentText());
  if (users.length === 0) {
    Logger.log("No users found for query: " + query);
    return;
  }

  Logger.log("Found " + users.length + " user(s):");
  users.forEach(function (user) {
    Logger.log(
      '  Name: "' +
        user.displayName +
        '" | accountId: "' +
        user.accountId +
        '"',
    );
  });

  return users;
}
