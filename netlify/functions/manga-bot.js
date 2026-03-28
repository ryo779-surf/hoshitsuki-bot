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

  if (!subCmd || subCmd === "ヘルプ" || subCmd === "help") {
    await replyToSlack(responseUrl,
      `:robot_face: *AI生成コンテンツエージェント — コマンド一覧*\n\n` +
      "`/manga レポート` — 週次レポートを今すぐ生成・投稿\n" +
      "`/manga コンテ [テーマ]` — マンガのコンテ・あらすじを生成\n" +
      "`/manga キャラ [設定]` — キャラクター設定シートを生成\n" +
      "`/manga キャプション [作品名]` — BOOTH/FANZA用販売説明文を生成\n" +
      "`/manga トレンド` — FANZAトレンドを調査して投稿\n" +
      "`/manga 進捗 [内容]` — 制作進捗を記録"
    );
    return;
  }

  if (subCmd === "レポート") {
    const report = await callClaude(SYSTEM,
      `<@${userId}> さんのリクエストで週次レポートを生成します。
現在の状況（第1作未着手、OL/お姉さんジャンルでマンガ形式を選定済み）を踏まえ、
今週の優先タスクと制作アドバイスを含むSlack用レポートを作成してください。`
    );
    await postToSlack(report);
    await replyToSlack(responseUrl, ":white_check_mark: レポートをチャンネルに投稿しました！");
    return;
  }

  if (subCmd === "コンテ") {
    const theme = args || "OLと上司の残業";
    const conte = await callClaude(SYSTEM,
      `「${theme}」をテーマにした同人マンガのコンテを作成してください。
タイトル案（3案）、あらすじ（100文字）、構成（全8〜16ページの各シーン概要）、
主なセリフ例（2〜3個）、推奨タグ（FANZA/DLsite用 10個）を出力してください。`
    );
    await postToSlack(`:pencil: *コンテ生成 — テーマ: ${theme}*\n\n${conte}`);
    await replyToSlack(responseUrl, ":white_check_mark: コンテをチャンネルに投稿しました！");
    return;
  }

  if (subCmd === "キャラ") {
    const setting = args || "28歳OL、黒髪ロング、眼鏡";
    const chara = await callClaude(SYSTEM,
      `「${setting}」のキャラクター設定シートを作成してください。
名前、年齢・職業・役職、外見の詳細（Stable Diffusionプロンプト英語も）、
性格・口調、制作時の一貫性ポイント、推奨プロンプトタグ（英語）を出力してください。`
    );
    await postToSlack(`:bust_in_silhouette: *キャラクター設定 — ${setting}*\n\n${chara}`);
    await replyToSlack(responseUrl, ":white_check_mark: キャラクター設定をチャンネルに投稿しました！");
    return;
  }

  if (subCmd === "キャプション") {
    const title = args || "新作マンガ";
    const caption = await callClaude(SYSTEM,
      `「${title}」のOL/お姉さん系同人マンガの販売説明文を生成してください。
BOOTH用（300文字）、FANZA用（500文字）、DLsiteキャッチコピー（50文字以内）、
検索タグ（20個）を出力してください。`
    );
    await postToSlack(`:clipboard: *販売説明文 — ${title}*\n\n${caption}`);
    await replyToSlack(responseUrl, ":white_check_mark: 販売説明文をチャンネルに投稿しました！");
    return;
  }

  if (subCmd === "トレンド") {
    const trends = await callClaude(SYSTEM,
      "FANZAとDLsiteで現在売れているOL・お姉さんジャンルの同人マンガのトレンドを分析して、" +
      "制作に活かせる具体的なキーワードや傾向を教えてください。"
    );
    const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    await postToSlack(`:mag: *FANZAトレンド分析 (${now})*\n\n${trends}`);
    await replyToSlack(responseUrl, ":white_check_mark: トレンド分析をチャンネルに投稿しました！");
    return;
  }

  if (subCmd === "進捗") {
    if (!args) { await replyToSlack(responseUrl, "進捗内容を入力してください。例: `/manga 進捗 第1作コンテ完成！`"); return; }
    const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    await postToSlack(`:white_check_mark: *制作進捗* (${now})\n<@${userId}> より\n\n> ${args}`);
    await replyToSlack(responseUrl, ":white_check_mark: 進捗を記録しました！");
    return;
  }

  await replyToSlack(responseUrl, `不明なコマンド: ${subCmd}\n\`/manga ヘルプ\` でコマンド一覧を確認してください。`);
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

  await handleCommand(subCmd, args, userId, responseUrl).catch(async (err) => {
    console.error("Error:", err);
    if (responseUrl) await replyToSlack(responseUrl, `:warning: エラー: ${err.message}`);
  });

  return { statusCode: 200, body: "" };
};
