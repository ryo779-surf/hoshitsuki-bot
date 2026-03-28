/**
 * 星月占い — Slack Slash Command Handler
 * Netlify Functions にデプロイして使用する
 *
 * 対応コマンド:
 *   /hoshi レポート      → 即座に週次レポートを生成・投稿
 *   /hoshi 占い [テーマ]  → 占いコンテンツを生成してSlackに投稿
 *   /hoshi タスク [内容]  → タスクをチャンネルに追加
 *   /hoshi ヘルプ        → コマンド一覧を表示
 *
 * 必要な環境変数 (Netlify Site Settings > Environment Variables):
 *   ANTHROPIC_API_KEY
 *   SLACK_BOT_TOKEN
 *   SLACK_CHANNEL_ID
 *   SLACK_SIGNING_SECRET   ← Slackからのリクエスト検証に使用
 */

const crypto = require("crypto");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SLACK_BOT_TOKEN   = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL_ID  = process.env.SLACK_CHANNEL_ID;
const SIGNING_SECRET    = process.env.SLACK_SIGNING_SECRET;

// ── Slackリクエストの署名検証 ──────────────────────────────
function verifySlackRequest(headers, rawBody) {
  const timestamp  = headers["x-slack-request-timestamp"];
  const signature  = headers["x-slack-signature"];
  if (!timestamp || !signature) return false;

  // リプレイ攻撃防止（5分以上古いリクエストは拒否）
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) return false;

  const baseStr  = `v0:${timestamp}:${rawBody}`;
  const expected = "v0=" + crypto.createHmac("sha256", SIGNING_SECRET)
                                 .update(baseStr)
                                 .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ── Claude API 呼び出し ───────────────────────────────────
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
  return data.content[0].text;
}

// ── Slackに投稿 ──────────────────────────────────────────
async function postToSlack(text, channel = SLACK_CHANNEL_ID) {
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text }),
  });
}

// ── コマンドハンドラ ─────────────────────────────────────
async function handleCommand(subCommand, args, userId) {

  // /hoshi ヘルプ
  if (subCommand === "ヘルプ" || subCommand === "help" || !subCommand) {
    return `:star2: *星月占いエージェント — コマンド一覧*

\`/hoshi レポート\` — 週次レポートを今すぐ生成して投稿
\`/hoshi 占い [テーマ]\` — 占いコンテンツを生成（例: /hoshi 占い 仕事運）
\`/hoshi タスク [内容]\` — タスクを追加（例: /hoshi タスク Instagram投稿を3本作る）
\`/hoshi ヘルプ\` — このヘルプを表示`;
  }

  // /hoshi レポート
  if (subCommand === "レポート") {
    // 非同期で生成・投稿（Slackは3秒以内に応答が必要なため即時返答→後で投稿）
    const system = `あなたは「星月占い（AIタロット占いサービス）」の事業エージェントです。`;
    const prompt = `<@${userId}> さんのリクエストで週次レポートを生成します。
現在の事業状況（Netlify/LINE/Stripe/X投稿 稼働中、Instagram API未連携）を踏まえ、
Slack向けの週次チェックレポートを生成してください。
冒頭に「<@${userId}> さんリクエストのレポートです！」と入れてください。`;

    const report = await callClaude(system, prompt);
    await postToSlack(report);
    return ":hourglass: レポートを生成して投稿しました！";
  }

  // /hoshi 占い [テーマ]
  if (subCommand === "占い") {
    const theme = args || "今週の運勢";
    const system = `あなたは「星月占い」サービスのコンテンツライターです。
AIタロット占いのコンテンツをSNS投稿用に作成してください。
ターゲットは占い好きの日本人女性。神秘的でポジティブなトーンで。`;
    const prompt = `「${theme}」をテーマにしたタロット占いコンテンツを作成してください。
X(Twitter)投稿用（140文字以内）とInstagram用（200〜300文字）の2パターンを出力。`;

    const content = await callClaude(system, prompt);
    await postToSlack(`:crystal_ball: *占いコンテンツ生成結果 — テーマ: ${theme}*\n\n${content}`);
    return ":hourglass: コンテンツを生成して投稿しました！";
  }

  // /hoshi タスク [内容]
  if (subCommand === "タスク") {
    if (!args) return "タスク内容を入力してください。例: `/hoshi タスク Instagram投稿を3本作る`";
    const now  = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    await postToSlack(`:white_check_mark: *新規タスク追加* (${now})\n<@${userId}> より\n\n> ${args}`);
    return ":white_check_mark: タスクを追加しました！";
  }

  return `不明なコマンド: ${subCommand}\n\`/hoshi ヘルプ\` でコマンド一覧を確認してください。`;
}

// ── Netlify Function エントリーポイント ────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const rawBody = event.body;

  // Slack 署名検証
  if (!verifySlackRequest(event.headers, rawBody)) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  // URLデコード
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  // Slack URL Verification (初回設定時)
  if (params.type === "url_verification") {
    return { statusCode: 200, body: JSON.stringify({ challenge: params.challenge }) };
  }

  const text    = (params.text || "").trim();
  const userId  = params.user_id || "unknown";
  const parts   = text.split(/\s+/);
  const subCmd  = parts[0] || "";
  const args    = parts.slice(1).join(" ");

// タイムアウト回避：即座に返答してバックグラウンドで処理
  handleCommand(subCmd, args, userId).catch(console.error);
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response_type: "ephemeral", text: ":hourglass: 生成中... チャンネルに投稿します！" }),
  };
