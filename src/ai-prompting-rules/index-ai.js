// ai-prompting-rules/index-ai.js
import express from "express";
import { geminiGenerateCode } from "./ai-code-builder.js";
import { geminiSelectFiles } from "./ai-select-files.js";

const router = express.Router();

// Gemini route
router.post('/llm-generate', geminiGenerateCode);
router.post("/llm-select-files", geminiSelectFiles);
export default router;