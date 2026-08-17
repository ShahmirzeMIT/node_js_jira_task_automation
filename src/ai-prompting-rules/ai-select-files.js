// ai-prompting-rules/ai-select-files.js

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env["GEMINI_API_KEY"],
});

// Yalnız fayl seçimi üçün ayrıca, yüngül prompt.
// Diqqət: burada fayl content-i YOXDUR, yalnız path/size/sha/type göndərilir.
const FILE_SELECTION_SYSTEM_PROMPT = `
You are an expert Senior Software Engineer.

You will be given:
1. A Jira task describing a required code change.
2. A list of repository files with ONLY their metadata (path, size, sha, type) — NOT their content.

Your job is to decide which of these files are actually relevant to implement the Jira task, based on file paths, names, and typical project structure conventions (pages, components, hooks, services, etc.).

RULES:
- Select the smallest set of files that are genuinely needed to implement the task.
- Prefer files whose path clearly relates to the feature described in the task (e.g. a "CartPage" file for a cart-related task).
- Include shared/related files only if there is a clear naming/structural signal they are involved (e.g. a hook or service used by the relevant page).
- Do NOT select unrelated files (e.g. admin pages, unrelated product pages) unless the task explicitly requires them.
- If you cannot confidently determine which files are needed from the given metadata alone, set "status" to "needs_more_information" and explain why in "reason".
- Only return paths that were provided to you. Never invent a file path.

========================
JIRA TASK
========================

{{JIRA_TASK}}

========================
REPOSITORY FILE STRUCTURE (metadata only, no content)
========================

{{FILES}}

========================
OUTPUT FORMAT
========================

Return ONLY valid JSON, no markdown, no code block, no explanations outside the JSON. Use exactly this structure:

{
  "task": "Short description of the Jira task",
  "status": "success",
  "selectedFiles": ["exact/path/to/file1.tsx", "exact/path/to/file2.tsx"],
  "reason": "Short explanation of why these files were selected",
  "warnings": []
}

If you cannot determine the needed files:

{
  "task": "Short description of the Jira task",
  "status": "needs_more_information",
  "selectedFiles": [],
  "reason": "Explain exactly what information or files are missing",
  "warnings": []
}
`;

/**
 * Strips ```json ... ``` or ``` ... ``` fences some models wrap
 * their output in despite instructions not to.
 */
function stripJsonFences(text) {
  return text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
}

/**
 * Walks a JSON-like string and escapes raw control characters
 * (newlines, tabs, carriage returns, etc.) that appear INSIDE
 * string literals, without touching valid existing escape sequences
 * or structural characters outside strings.
 */
function sanitizeJsonControlChars(input) {
  let result = "";
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const code = input.charCodeAt(i);

    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }

    if (char === "\\" && inString) {
      result += char;
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    if (inString && code < 0x20) {
      switch (char) {
        case "\n":
          result += "\\n";
          break;
        case "\r":
          result += "\\r";
          break;
        case "\t":
          result += "\\t";
          break;
        case "\b":
          result += "\\b";
          break;
        case "\f":
          result += "\\f";
          break;
        default:
          result += "\\u" + code.toString(16).padStart(4, "0");
      }
      continue;
    }

    result += char;
  }

  return result;
}

/**
 * Attempts to parse a possibly-malformed JSON string returned by the AI.
 * Tries a straight parse first, then falls back to fence-stripping,
 * then to control-character sanitization.
 */
function safeParseAiJson(rawText) {
  const stripped = stripJsonFences(rawText);

  let cleanedText = stripped;
  const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleanedText = jsonMatch[0];
  }

  try {
    return JSON.parse(cleanedText);
  } catch (firstError) {
    try {
      const sanitized = sanitizeJsonControlChars(cleanedText);
      return JSON.parse(sanitized);
    } catch (secondError) {
      throw secondError;
    }
  }
}

// Gemini API Route - Select Relevant Files
export const geminiSelectFiles = async (req, res) => {
  try {
    const { jiraTask, fileStructure } = req.body;

    // Validate request
    if (!jiraTask) {
      return res.status(400).json({
        error: "Missing required field: jiraTask",
        status: "error",
      });
    }

    if (!fileStructure || !Array.isArray(fileStructure) || fileStructure.length === 0) {
      return res.status(400).json({
        error: "Missing required field: fileStructure (must be a non-empty array)",
        status: "error",
      });
    }

    // Validate each file metadata entry
    for (const file of fileStructure) {
      if (!file.path) {
        return res.status(400).json({
          error: "Each fileStructure entry must have a 'path' field",
          status: "error",
        });
      }
    }

    const filesContext = JSON.stringify(fileStructure, null, 2);

    const finalPrompt = FILE_SELECTION_SYSTEM_PROMPT
      .replace("{{JIRA_TASK}}", jiraTask)
      .replace("{{FILES}}", filesContext);

    const result = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: finalPrompt,
    });

    const rawText = result.text ?? "";

    let parsedResponse;

    try {
      parsedResponse = safeParseAiJson(rawText);

      if (!parsedResponse.status) {
        parsedResponse.status = "success";
      }
      if (!Array.isArray(parsedResponse.selectedFiles)) {
        parsedResponse.selectedFiles = [];
      }
      if (!Array.isArray(parsedResponse.warnings)) {
        parsedResponse.warnings = [];
      }

      // Guard against invented paths: only keep paths that were
      // actually provided in fileStructure.
      const validPaths = new Set(fileStructure.map((f) => f.path));
      const filteredSelected = parsedResponse.selectedFiles.filter((p) =>
        validPaths.has(p)
      );

      if (filteredSelected.length !== parsedResponse.selectedFiles.length) {
        parsedResponse.warnings.push(
          "Some selected file paths were not present in the provided file structure and were removed."
        );
        parsedResponse.selectedFiles = filteredSelected;
      }
    } catch (parseError) {
      parsedResponse = {
        task: jiraTask.substring(0, 100),
        status: "needs_more_information",
        selectedFiles: [],
        reason: "Failed to parse AI response. Please try again.",
        warnings: [
          "AI response was not valid JSON",
          parseError instanceof Error
            ? parseError.message
            : "Unknown JSON parsing error",
        ],
      };
    }

    return res.status(200).json({
      data: parsedResponse,
      status: "200",
      message: "Gemini file selection processed successfully",
    });
  } catch (error) {
    console.error("Gemini API Error:", error);

    const message =
      error instanceof Error ? error.message : "Gemini API error";

    return res.status(500).json({
      task: "Error processing request",
      status: "error",
      selectedFiles: [],
      reason: "An error occurred while processing the request",
      warnings: [message],
    });
  }
};