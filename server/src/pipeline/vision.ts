import { readFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { VisionOutputSchema, type VisionOutput } from "../schema/styleSpec.js";
import { buildStyleAnalysisPrompt, buildRetryPrompt } from "../prompts/styleAnalysis.js";
import type { Keyframe } from "../jobs.js";

const MODEL = "claude-sonnet-4-6";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set — required for vision analysis.");
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

async function frameToImageBlock(kf: Keyframe): Promise<Anthropic.ImageBlockParam> {
  const buffer = await readFile(kf.filePath);
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: "image/jpeg",
      data: buffer.toString("base64"),
    },
  };
}

async function callVision(prompt: string, keyframes: Keyframe[]): Promise<string> {
  const anthropic = getClient();
  const content: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [
    { type: "text", text: prompt },
  ];

  for (const kf of keyframes) {
    content.push({
      type: "text",
      text: `Shot ${kf.shotIndex}, t=${kf.timestampSec.toFixed(2)}s`,
    });
    content.push(await frameToImageBlock(kf));
  }

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Vision response contained no text content.");
  }
  return textBlock.text;
}

/**
 * Runs Claude vision over the (already downsampled) keyframe set in a single
 * batched call, parses JSON defensively, and retries once with the
 * validation error appended if the shape doesn't match.
 */
export async function analyzeVision(
  keyframes: Keyframe[],
  durationSec: number
): Promise<VisionOutput> {
  const prompt = buildStyleAnalysisPrompt(keyframes.length, durationSec);

  let raw = await callVision(prompt, keyframes);
  let parsed = tryParse(raw);
  let result = parsed ? VisionOutputSchema.safeParse(parsed) : null;

  if (!result || !result.success) {
    const validationError = result ? result.error.message : "Response was not valid JSON.";
    const retryPrompt = buildRetryPrompt(prompt, validationError, raw);
    raw = await callVision(retryPrompt, keyframes);
    parsed = tryParse(raw);
    result = parsed ? VisionOutputSchema.safeParse(parsed) : null;
  }

  if (!result || !result.success) {
    throw new Error(
      `Vision analysis failed schema validation after retry: ${result ? result.error.message : "invalid JSON"}`
    );
  }

  return result.data;
}

function tryParse(raw: string): unknown | null {
  try {
    return JSON.parse(stripFences(raw));
  } catch {
    return null;
  }
}
