const crypto = require("crypto");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SLACK_BOT_TOKEN   = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL_ID  = process.env.SLACK_CHANNEL_ID;
const SIGNING_SECRET    = process.env.SLACK_SIGNING_SECRET;

function verifySlackRequest(headers, rawBody) {
  const timestamp = headers["x-slack-request-timestamp"];
  const signature = headers["x-slack-signature"];
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) return false;
  const baseStr  = `v0:${timestamp}:${rawBody}`;
  const expected = "v0=" + crypto.createHmac("sha256", SIGNING_SECRET).update(baseStr).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch { return false; }
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

// response_url に結果を返す（Slack推奨の遅延レスポンス方式）
async function replyToSlack(responseUrl, text) {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response_type: "ephemeral", text }),
  });
}

async function handleCommand(subCmd, args, userId, responseUrl) {
  const SYSTEM_BASE = `あなたは「星月占い（AIタロット占いサービス）」の事業エージェントです。ターゲットは占い好きの日本人女性層。`;

  if (!subCmd || subCmd === "ヘルプ" || subCmd === "help") {
    await replyToSlack(responseUrl,
      `:star2: *星月占いエージェント — コマンド一覧*\n\n` +
      "`/hoshi レポート` — 週次レポートを今すぐ生成・投稿\n" +
      "`/hoshi 占い [テーマ]` — SNSコンテンツを生成（例: /hoshi 占い 仕事運）\n" +
      "`/hoshi タスク [内容]` — タスクを追加\n" +
      "`/hoshi ヘルプ` — このヘルプを表示"
    );
    return;
  }

  if (subCmd === "レポート") {
    const report = await callClaude(SYSTEM_BASE,
      `<@${userId}> さんのリクエストで週次レポートを生成します。現在の事業状況（Netlify/LINE/Stripe/X投稿 稼働中、Instagram API未連携）を踏まえ、今週の優先タスクと改善アドバイスを含むSlack用レポートを作成してください。`
    );
    await postToSlack(report);
    await replyToSlack(responseUrl, ":white_check_mark: レポートをチャンネルに投稿しました！");
    return;
  }

  if (subCmd === "占い") {
    const theme = args || "今週の運勢";
    const content = await callClaude(SYSTEM_BASE,
      `「${theme}」をテーマにしたタロット占いコンテンツを作成してください。X(Twitter)用（140文字以内）とInstagram用（200〜300文字）の2パターンを出力。`
    );
    await postToSlack(`:crystal_ball: *占いコンテンツ — テーマ: ${theme}*\n\n${content}`);
    await replyToSlack(responseUrl, ":white_check_mark: コンテンツをチャンネルに投稿しました！");
    return;
  }

  if (subCmd === "タスク") {
    if (!args) { await replyToSlack(responseUrl, "タスク内容を入力してください。例: `/hoshi タスク Instagram投稿を3本作る`"); return; }
    const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    await postToSlack(`:white_check_mark: *新規タスク* (${now})\n<@${userId}> より\n\n> ${args}`);
    await replyToSlack(responseUrl, ":white_check_mark: タスクを追加しました！");
    return;
  }

  await replyToSlack(responseUrl, `不明なコマンド: ${subCmd}\n\`/hoshi ヘルプ\` でコマンド一覧を確認してください。`);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  if (!verifySlackRequest(event.headers, event.body)) return { statusCode: 401, body: "Unauthorized" };

  const params = Object.fromEntries(new URLSearchParams(event.body));
  if (params.type === "url_verification") {
    return { statusCode: 200, body: JSON.stringify({ challenge: params.challenge }) };
  }

  const text        = (params.text || "").trim();
  const userId      = params.user_id || "unknown";
  const responseUrl = params.response_url;
  const parts       = text.split(/\s+/);
  const subCmd      = parts[0] || "";
  const args        = parts.slice(1).join(" ");

  // Slackに即座に200を返しつつ、処理を続行
  const processing = handleCommand(subCmd, args, userId, responseUrl).catch(async (err) => {
    console.error("Error:", err);
    if (responseUrl) {
      await replyToSlack(responseUrl, `:warning: エラーが発生しました: ${err.message}`);
    }
  });

  // Netlifyがawaitしないと処理が死ぬのでwaitAll
  await processing;

  return { statusCode: 200, body: "" };
};
