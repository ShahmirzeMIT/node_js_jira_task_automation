// ai-prompting-rules/ai-code-builder.js

import { GoogleGenAI } from "@google/genai";

import { CORE_RULES } from "./rules/core-rules.js";
import { MODIFICATION_RULES } from "./rules/modification-rules.js";
import { FILE_CREATION_RULES } from "./rules/file-creation-rules.js";
import { FILE_DELETION_RULES } from "./rules/file-deletion-rules.js";
import { LANGUAGE_RULES } from "./rules/language-rules.js";
import { ANALYSIS_RULES } from "./rules/analysis-rules.js";
import { OUTPUT_SCHEMA } from "./rules/output-schema.js";
import { VALIDATION_RULES } from "./rules/validation-rules.js";

const ai = new GoogleGenAI({
  apiKey: process.env["GEMINI_API_KEY"],
});

const SYSTEM_PROMPT = `
${CORE_RULES}

${MODIFICATION_RULES}

${FILE_CREATION_RULES}

${FILE_DELETION_RULES}

${LANGUAGE_RULES}

${ANALYSIS_RULES}

{{JIRA_TASK}}

{{FILES}}

${OUTPUT_SCHEMA}

${VALIDATION_RULES}
`;


// Gemini API Route - Generate Code Changes
export const geminiGenerateCode = async (req, res) => {
  try {
    const { jiraTask, files } = req.body;

    // Validate request
    if (!jiraTask) {
      return res.status(400).json({
        error: "Missing required field: jiraTask",
        status: "error",
      });
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        error: "Missing required field: files (must be a non-empty array)",
        status: "error",
      });
    }

    // Validate each file
    for (const file of files) {
      if (!file.path || !file.content) {
        return res.status(400).json({
          error: "Each file must have 'path' and 'content' fields",
          status: "error",
        });
      }
    }

    // Build files context
    const filesContext = files
      .map(
        (file) => `
FILE PATH: ${file.path}
${file.language ? `LANGUAGE: ${file.language}` : ""}
${file.isNew ? "STATUS: NEW FILE (will be created)" : ""}
COMPLETE FILE CONTENT:
${file.content}
END OF FILE
`
      )
      .join("\n");

    // Build final prompt
    const finalPrompt = SYSTEM_PROMPT
      .replace("{{JIRA_TASK}}", jiraTask)
      .replace("{{FILES}}", filesContext);

    // Call Gemini API
    const result = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: finalPrompt,
    });

    const text = result.text ?? "";

    // Parse response
    let parsedResponse;

    try {
      let cleanedText = text.trim();

      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        cleanedText = jsonMatch[0];
      }

      parsedResponse = JSON.parse(cleanedText);

      if (!parsedResponse.status) {
        parsedResponse.status = "success";
      }
    } catch (parseError) {
      parsedResponse = {
        task: jiraTask.substring(0, 100),
        status: "error",
        summary: "Failed to parse AI response. Please try again.",
        language: "unknown",
        framework: "unknown",
        files: [],
        newFiles: [],
        deletedFiles: [],
        unchangedFiles: [],
        warnings: [
          "AI response was not valid JSON",
          parseError instanceof Error
            ? parseError.message
            : "Unknown JSON parsing error",
        ],
        needsMoreInformation:
          "The AI response could not be parsed. Please check the API response.",
      };
    }

    // Return response
    return res.status(200).json({ data: parsedResponse , status: "200", message: "Gemini API response processed successfully" });
  } catch (error) {
    console.error("Gemini API Error:", error);

    const message =
      error instanceof Error ? error.message : "Gemini API error";

    return res.status(500).json({
      task: "Error processing request",
      status: "error",
      summary: "An error occurred while processing the request",
      language: "unknown",
      framework: "unknown",
      files: [],
      newFiles: [],
      deletedFiles: [],
      unchangedFiles: [],
      warnings: [message],
      needsMoreInformation:
        "API request failed. Please check your connection and API key.",
    });
  }
};