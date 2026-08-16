// ai-prompting-rules/index-ai.js
import express from "express";
import { geminiGenerateCode } from "./ai-code-builder.js";

const router = express.Router();

// Gemini route
router.post('/llm-generate', geminiGenerateCode);

export default router;