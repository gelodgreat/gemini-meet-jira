/**
 * NotesParser.gs - Gemini Meeting Notes Content Parser
 *
 * Reads a Google Doc produced by Gemini's "Take notes for me" feature and
 * extracts structured data: meeting summary, decisions, and next steps
 * (action items).
 *
 * Uses the Google Docs Advanced Service (Docs.Documents.get) instead of
 * DocumentApp.openById() because Gemini notes contain smart chips (people
 * @mentions, calendar links) that DocumentApp cannot handle.
 *
 * Requires: Google Docs API enabled in Services (+ button in Apps Script editor).
 *
 * Gemini notes structure:
 *   Heading: "Summary"    → paragraph text
 *   Heading: "Decisions"  → list items with optional status in parentheses
 *   Heading: "Next Steps" → list items, each being one action item
 *   Heading: "Details"    → extended paragraph text
 */

/**
 * Main entry point: parse a Gemini meeting notes doc.
 *
 * @param {string} docId - Google Drive file ID of the document
 * @returns {{ summary: string, decisions: Array, nextSteps: Array, details: string }}
 */
function parseMeetingNotes(docId) {
  var sections = extractDocSections(docId);

  return {
    summary: getSectionLines(sections, CONFIG.SECTIONS.SUMMARY)
      .join("\n")
      .trim(),
    decisions: parseDecisions(
      getSectionLines(sections, CONFIG.SECTIONS.DECISIONS),
    ),
    nextSteps: parseNextSteps(
      getSectionLines(sections, CONFIG.SECTIONS.NEXT_STEPS),
    ),
    details: getSectionLines(sections, CONFIG.SECTIONS.DETAILS)
      .join("\n")
      .trim(),
  };
}

/**
 * Look up section lines by checking all aliases for a section.
 * CONFIG.SECTIONS values are arrays of aliases (e.g. ["Next Steps", "Suggested next steps"]).
 * Returns the lines for the first matching alias found.
 *
 * @param {Object.<string, string[]>} sections - Map of section name → lines
 * @param {string|string[]} aliases - Section name or array of aliases
 * @returns {string[]}
 */
function getSectionLines(sections, aliases) {
  if (typeof aliases === "string") aliases = [aliases];
  var sectionKeys = Object.keys(sections);
  for (var i = 0; i < aliases.length; i++) {
    // Case-insensitive match against stored section keys
    for (var j = 0; j < sectionKeys.length; j++) {
      if (sectionKeys[j].toLowerCase() === aliases[i].toLowerCase()) {
        return sections[sectionKeys[j]];
      }
    }
  }
  return [];
}

/**
 * Fetch the document via the Docs Advanced Service and group content
 * by section heading.
 *
 * Uses Docs.Documents.get() which returns a JSON structure. This works
 * with Gemini notes that contain smart chips, unlike DocumentApp.openById().
 *
 * @param {string} docId - Google Drive file ID
 * @returns {Object.<string, string[]>} Map of section name → array of text lines
 */
function extractDocSections(docId) {
  var doc = Docs.Documents.get(docId);
  var body = doc.body;
  if (!body || !body.content) return {};

  var sections = {};
  var currentSection = null;

  // Build a flat list of all known section names (lowercased) for matching
  var allAliases = [];
  var allSectionConfigs = Object.values(CONFIG.SECTIONS);
  for (var s = 0; s < allSectionConfigs.length; s++) {
    var aliases =
      typeof allSectionConfigs[s] === "string"
        ? [allSectionConfigs[s]]
        : allSectionConfigs[s];
    for (var a = 0; a < aliases.length; a++) {
      allAliases.push(aliases[a].toLowerCase());
    }
  }

  for (var i = 0; i < body.content.length; i++) {
    var element = body.content[i];

    if (element.paragraph) {
      var paragraph = element.paragraph;
      var text = extractParagraphText(paragraph).trim();
      if (!text) continue;

      var isHeading = isHeadingParagraph(paragraph);
      var isBoldNormal = !isHeading && isParagraphAllBold(paragraph);

      var isSectionBoundary =
        allAliases.indexOf(text.toLowerCase()) !== -1 &&
        (isHeading || isBoldNormal);

      if (isSectionBoundary) {
        // Store under the original text (preserving case) so getSectionLines
        // can match it against the aliases array
        currentSection = text;
        if (!sections[currentSection]) {
          sections[currentSection] = [];
        }
      } else if (currentSection) {
        // Check if this paragraph is a list item (has a bullet property)
        if (paragraph.bullet) {
          sections[currentSection].push("• " + text);
        } else {
          sections[currentSection].push(text);
        }
      }
    }
  }

  return sections;
}

/**
 * Extract plain text from a Docs API paragraph object.
 * Concatenates all textRun content, skipping smart chips and other
 * non-text elements.
 *
 * @param {Object} paragraph - Docs API paragraph object
 * @returns {string}
 */
function extractParagraphText(paragraph) {
  if (!paragraph.elements) return "";

  var text = "";
  for (var i = 0; i < paragraph.elements.length; i++) {
    var element = paragraph.elements[i];
    if (element.textRun && element.textRun.content) {
      text += element.textRun.content;
    }
    // Smart chips (person, richLink, etc.) are skipped — they don't have
    // textRun but may have person.personProperties.name which we could
    // extract if needed in the future.
    if (element.person && element.person.personProperties) {
      text += element.person.personProperties.name || "";
    }
  }
  return text;
}

/**
 * Returns true if a Docs API paragraph has a heading style (HEADING_1 through HEADING_6).
 *
 * @param {Object} paragraph - Docs API paragraph object
 * @returns {boolean}
 */
function isHeadingParagraph(paragraph) {
  var style = paragraph.paragraphStyle;
  if (!style || !style.namedStyleType) return false;

  return (
    style.namedStyleType === "HEADING_1" ||
    style.namedStyleType === "HEADING_2" ||
    style.namedStyleType === "HEADING_3" ||
    style.namedStyleType === "HEADING_4"
  );
}

/**
 * Returns true if every non-empty text run in a paragraph is bold.
 * Used as a fallback to detect section headings formatted as bold normal text.
 *
 * @param {Object} paragraph - Docs API paragraph object
 * @returns {boolean}
 */
function isParagraphAllBold(paragraph) {
  if (!paragraph.elements || paragraph.elements.length === 0) return false;

  var hasText = false;
  for (var i = 0; i < paragraph.elements.length; i++) {
    var element = paragraph.elements[i];
    if (element.textRun) {
      var content = (element.textRun.content || "").trim();
      if (!content) continue;
      hasText = true;
      var style = element.textRun.textStyle;
      if (!style || !style.bold) return false;
    }
  }
  return hasText;
}

/**
 * Parse the Next Steps section lines into structured action items.
 *
 * Supported action item formats (Gemini varies):
 *   • Review the proposal (John Smith)
 *   • Review the proposal - John Smith
 *   • Review the proposal by John Smith
 *   • Review the proposal — Owner: John Smith
 *   • Review the proposal
 *
 * @param {string[]} lines - Lines from the Next Steps section
 * @returns {Array<{title: string, assignee: string|null, details: string}>}
 */
function parseNextSteps(lines) {
  if (!lines || lines.length === 0) return [];

  var items = [];
  var currentItem = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    var isBullet = /^[•\-\*]/.test(line) || /^\d+\.\s/.test(line);

    if (isBullet) {
      // Save the previous item before starting a new one
      if (currentItem) items.push(currentItem);

      // Strip the bullet/number prefix
      var cleanText = line
        .replace(/^[•\-\*]\s*/, "")
        .replace(/^\d+\.\s*/, "")
        .trim();
      currentItem = parseActionItemText(cleanText);
    } else if (currentItem) {
      // Indented continuation lines become the item's details field
      currentItem.details = currentItem.details
        ? currentItem.details + " " + line
        : line;
    }
  }

  if (currentItem) items.push(currentItem);

  return items.filter(function (item) {
    return item.title && item.title.length > 2;
  });
}

/**
 * Parse a single action item text string to extract the task title
 * and an optional assignee name.
 *
 * @param {string} text - Raw text of one action item
 * @returns {{title: string, assignee: string|null, details: string}}
 */
function parseActionItemText(text) {
  var item = { title: text, assignee: null, details: "" };

  // Pattern 1: "Title (Assignee Name)"
  var parenMatch = text.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    item.title = parenMatch[1].trim();
    item.assignee = parenMatch[2].trim();
    return item;
  }

  // Pattern 2: "Title — Owner: Assignee" or "Title - Owner: Assignee"
  var ownerMatch = text.match(/^(.+?)\s*[—–\-]\s*Owner:\s*(.+)$/i);
  if (ownerMatch) {
    item.title = ownerMatch[1].trim();
    item.assignee = ownerMatch[2].trim();
    return item;
  }

  // Pattern 3: "Title by Assignee Name" (only if Assignee looks like a name)
  var byMatch = text.match(/^(.+?)\s+by\s+([A-Z][a-z]+(?:\s+[A-Za-z]+)*)$/);
  if (byMatch) {
    item.title = byMatch[1].trim();
    item.assignee = byMatch[2].trim();
    return item;
  }

  // Pattern 4: "Title - Assignee Name" (dash, then a plausible human name)
  var dashMatch = text.match(/^(.+?)\s+-\s+([A-Z][a-z]+(?:\s+[A-Za-z]+)*)$/);
  if (dashMatch) {
    var candidate = dashMatch[2].trim();
    // Accept only if it looks like ≤4 words and is Title-cased
    if (candidate.split(/\s+/).length <= 4) {
      item.title = dashMatch[1].trim();
      item.assignee = candidate;
      return item;
    }
  }

  return item;
}

/**
 * Parse the Decisions section lines.
 *
 * Expected format per line: "Decision text (Aligned|Disagreed|Shelved)"
 *
 * @param {string[]} lines - Lines from the Decisions section
 * @returns {Array<{text: string, status: string}>}
 */
function parseDecisions(lines) {
  if (!lines || lines.length === 0) return [];

  return lines
    .map(function (line) {
      var clean = line.replace(/^[•\-\*]\s*/, "").trim();
      if (!clean) return null;

      var statusMatch = clean.match(
        /^(.+?)\s*\((Aligned|Disagreed|Shelved)\)\s*$/i,
      );
      if (statusMatch) {
        return { text: statusMatch[1].trim(), status: statusMatch[2] };
      }
      return { text: clean, status: "Unknown" };
    })
    .filter(Boolean);
}
