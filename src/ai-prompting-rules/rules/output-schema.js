export const OUTPUT_SCHEMA = `
OUTPUT FORMAT:

Return ONLY valid JSON.

Use exactly this structure:

{
  "task": "Short description of the Jira task",
  "status": "success",
  "summary": "Short explanation of the implemented changes",
  "language": "The primary programming language(s) used",
  "framework": "The framework used (if applicable)",
  "files": [
    {
      "path": "exact/path/to/file.tsx",
      "changed": true,
      "reason": "Why this file needed to be changed",
      "changes": [
        "Specific change made",
        "Another specific change made"
      ],
      "content": "COMPLETE MODIFIED FILE CONTENT"
    }
  ],
  "newFiles": [
    {
      "path": "exact/path/to/new/file.tsx",
      "content": "COMPLETE NEW FILE CONTENT",
      "language": "typescript",
      "reason": "Why this new file is needed"
    }
  ],
  "deletedFiles": [
    {
      "path": "exact/path/to/file.tsx",
      "reason": "Why this file should be deleted"
    }
  ],
  "unchangedFiles": [
    {
      "path": "exact/path/to/file.tsx",
      "reason": "Why this file does not need modification"
    }
  ],
  "warnings": [],
  "needsMoreInformation": "Only when status is 'needs_more_information'"
}

OUTPUT RULES:

1. "files" MUST contain ONLY files that actually need modification.

2. "newFiles" MUST contain ONLY files that need to be created.

3. "deletedFiles" MUST contain ONLY files that need to be deleted.

4. "unchangedFiles" MUST contain provided files that do not need modification.

5. "content" MUST contain the COMPLETE final content of the file.

6. Do NOT omit imports.

7. Do NOT omit includes.

8. Do NOT omit unchanged parts of a modified file.

9. Do NOT use placeholders.

10. Do NOT use "...".

11. Do NOT shorten code.

12. Do NOT return markdown.

13. Do NOT return explanations outside JSON.

14. Do NOT wrap JSON in a markdown code block.

15. Ensure the JSON is syntactically valid.

16. Never return a file that was not provided unless it is listed in "newFiles".

17. Preserve exact file paths.

18. Detect the programming language from file extensions.
`;