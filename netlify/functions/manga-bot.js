const crypto = require("crypto");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SLACK_BOT_TOKEN   = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL_ID  = process.env.SLACK_CHANNEL_ID_MANGA || "C0APK7TAXDJ";
const SIGNING_SECRET    = process.env.SLACK_SIGNING_SECRET;

function verifySlackRequest(headers, rawBody) {
  const timestamp = headers["x-slack-request-timestamp"];
  const signature = headers["x-slack-signature"];
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) return false;
  const baseStr  = `v0:${timestamp}:${rawBody}`;
  const expected = "v0=" + crypto.createHmac("sha256", SIGNING_SECRET).update(baseStr).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)); }
  catch { return false; }
}

async function callClaude(systemPrompt, userMessage) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  const data = await res.json();
  return data.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
}

async function postToSlack(text) {
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Authorization": `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel: SLACK_CHANNEL_ID, text }),
  });
}

async function replyToSlack(responseUrl, text) {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response_type: "ephemeral", text }),
  });
}

async function handleCommand(subCmd, args, userId, responseUrl) {
  const SYSTEM = `あなたはFANZA・DLsite向けAI生成同人マンガの制作・販売エージェントです。
ジャンルはOL/お姉さん系。BOOTH先行テスト→FANZA/DLsite本番展開の戦略。`;

  if (!subCmd || subCmd === "ヘル
