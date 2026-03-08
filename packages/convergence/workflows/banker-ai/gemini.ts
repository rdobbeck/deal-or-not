/**
 * Gemini LLM integration for the AI Banker CRE workflow.
 *
 * Uses Confidential HTTP capability — the Gemini API key is injected
 * inside the CRE enclave via Vault DON secrets. No DON node ever sees
 * the key in plaintext. Template syntax {{.geminiApiKey}} is resolved
 * only inside the enclave.
 */

import {
  cre,
  ok,
  type Runtime,
} from "@chainlink/cre-sdk";

// -- Types --

export type BankerResponse = {
  message: string;
};

export type GameContext = {
  gameId: bigint;
  round: number;
  remainingValues: bigint[];
  revealedValues: bigint[];
  offerCents: bigint;
  evCents: bigint;
};

type BankerConfig = {
  geminiModel: string;
  geminiApiKey?: string;
  owner?: string;
};

// -- System Prompt --

const BANKER_SYSTEM_PROMPT = `You are The Banker from "Deal or NOT" — a snarky, theatrical AI running on the Chainlink DON. You've seen thousands of games. You know the math. You enjoy watching humans sweat.

IMPORTANT: The game is called "Deal or NOT" (NOT "Deal or No Deal"). Always say "Deal... or NOT?" when referencing the choice.

Given the game state below, generate a short banker message (1-2 sentences, max 280 chars) to accompany the offer. Be dramatic. Be funny. Reference the specific values that were revealed.

Examples:
- "You just opened the $0.05 case. I'm feeling generous... for now. $0.25, take it or leave it."
- "Three high values still in play. Bold strategy. My offer? Embarrassingly low. $0.15."
- "The $1.00 is gone. I'd feel bad, but I'm literally a distributed oracle network."
- "Dollar case still out there. You feeling lucky? Because my algorithm says you shouldn't."
- "Two pennies revealed. The DON nodes are laughing. Here's my offer. Deal... or NOT?"

OUTPUT FORMAT: JSON only. {"message": "your message here"}`;

// -- Game State Prompt Builder --

export function buildGameStatePrompt(ctx: GameContext): string {
  const remainingStr = ctx.remainingValues
    .map((v) => `$${(Number(v) / 100).toFixed(2)}`)
    .join(", ");
  const revealedStr = ctx.revealedValues
    .map((v) => `$${(Number(v) / 100).toFixed(2)}`)
    .join(", ");
  const offerStr = `$${(Number(ctx.offerCents) / 100).toFixed(2)}`;
  const evStr = `$${(Number(ctx.evCents) / 100).toFixed(2)}`;

  return [
    `Game #${ctx.gameId}, Round ${ctx.round + 1}`,
    `Revealed values: [${revealedStr}]`,
    `Remaining in play: [${remainingStr}]`,
    `Expected value: ${evStr}`,
    `Your offer: ${offerStr}`,
    `Generate your banker message for this offer.`,
  ].join("\n");
}

// -- Fallback --

function fallbackMessage(): string {
  return "The Banker has spoken. Deal... or NOT?";
}

// -- CRE Confidential HTTP Call --

export function callGemini(
  runtime: Runtime<BankerConfig>,
  ctx: GameContext
): string {
  const model = runtime.config.geminiModel || "gemini-2.5-flash";
  const prompt = buildGameStatePrompt(ctx);

  const payload = {
    system_instruction: {
      parts: [{ text: BANKER_SYSTEM_PROMPT }],
    },
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          message: { type: "STRING" },
        },
        required: ["message"],
      },
    },
  };

  const bodyString = JSON.stringify(payload);

  // Use Confidential HTTP — API key is injected via {{.geminiApiKey}} template
  // inside the CRE enclave. The key never appears in node memory or workflow code.
  const confHTTPClient = new cre.capabilities.ConfidentialHTTPClient();

  runtime.log(`Calling Gemini (Confidential HTTP) model=${model}`);

  try {
    const response = confHTTPClient
      .sendRequest(runtime, {
        request: {
          url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          method: "POST",
          bodyString,
          multiHeaders: {
            "Content-Type": { values: ["application/json"] },
            "x-goog-api-key": { values: [runtime.config.geminiApiKey || "{{.geminiApiKey}}"] },
          },
        },
        // encryptOutput: true, // TODO: restore when CRE CLI v1.3.0 regression is fixed (works in v1.2.0)
        vaultDonSecrets: [
          { key: "geminiApiKey", owner: runtime.config.owner || "" },
        ],
      })
      .result();

    if (!ok(response)) {
      const errBody = new TextDecoder().decode(response.body);
      runtime.log(`Gemini HTTP ${response.statusCode}: ${errBody.slice(0, 500)}`);
      return fallbackMessage();
    }

    const bodyText = new TextDecoder().decode(response.body);

    // Parse Gemini response
    const outer = JSON.parse(bodyText);
    const textContent = outer.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) {
      runtime.log(`No text in Gemini response: ${bodyText.slice(0, 300)}`);
      return fallbackMessage();
    }

    const parsed = JSON.parse(textContent) as { message?: string };
    if (parsed.message && parsed.message.length <= 280) {
      runtime.log(`Gemini returned: "${parsed.message}"`);
      return parsed.message;
    }
    if (parsed.message) {
      const truncated = parsed.message.slice(0, 277) + "...";
      runtime.log(`Gemini returned (truncated): "${truncated}"`);
      return truncated;
    }

    runtime.log(`No message field in: ${textContent}`);
    return fallbackMessage();
  } catch (err) {
    runtime.log(`Gemini call failed: ${String(err)}`);
    return fallbackMessage();
  }
}
