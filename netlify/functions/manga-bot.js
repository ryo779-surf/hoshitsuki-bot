/**
 * AI生成コンテンツ事業 — Slack Slash Command Handler
 * Netlify Functions にデプロイして使用する
 *
 * 対応コマンド:
 *   /manga レポート              → 即座に週次レポートを生成・投稿
 *   /manga コンテ [テーマ]        → マンガのコンテ（あらすじ・構成）を生成
 *   /manga キャラ [設定]          → キャラクター設定シートを生成
 *   /manga キャプション [内容]    → BOOTH/FANZA用の販売説明文を生成
 *   /manga トレンド               → 今のFANZA/DLsiteトレンドを調査して投稿
 *   /manga 進捗 [内容]            → 制作進捗をチャンネルに記録
 *   /manga ヘルプ                 → コマンド一覧を表示
 *
 * 必要な環境変数 (Netlify Environment Variables):
 *   ANTHROPIC_API_KEY
 *   SLACK_BOT_TOKEN
 *   SLACK_CHANNEL_ID
 *   SLACK_SIGNING_SECRET
 */

const crypto = require("crypto");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SLACK_BOT_TOKEN   = process.env.SLACK_BOT_TOKEN_MANGA || process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL_ID  = process.env.SLACK_CHANNEL_ID_MANGA || process.env.SLACK_CHANNEL_ID;
const SIGNING_SECRET    = process.env.SLACK_SIGNING_SECRET_MANGA || process.env.SLACK_SIGNING_SECRET;

// ── Slack リクエスト署名検証 ──────────────────────────────
function verifySlackRequest(headers, rawBody) {
  const timestamp = headers["x-slack-request-timestamp"];
  const signature = headers["x-slack-signature"];
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) return false;

  const baseStr  = `v0:${timestamp}:${rawBody}`;
  const expected = "v0=" + crypto.createHmac("sha256", SIGNING_SECRET)
                                 .update(baseStr).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ── Claude API 呼び出し（web_search ツール付き） ──────────
async function callClaude(systemPrompt, userMessage, useWebSearch = false) {
  const body = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  };
  if (useWebSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return data.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("\n")
    .trim();
}

// ── Slackに投稿 ──────────────────────────────────────────
async function postToSlack(text) {
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: SLACK_CHANNEL_ID, text }),
  });
}

// ── コマンドハンドラ ─────────────────────────────────────
async function handleCommand(subCmd, args, userId) {

  const SYSTEM_BASE = `あなたはFANZA・DLsite向けAI生成同人マンガの制作・販売エージェントです。
ジャンルはOL/お姉さん系。Google Colab Pro (A100) + HuggingFaceで画像生成。
BOOTH先行テスト→FANZA/DLsite本番展開の戦略。ターゲットは成人男性。`;

  // ヘルプ
  if (!subCmd || subCmd === "ヘルプ" || subCmd === "help") {
    return `:robot_face: *AI生成コンテンツエージェント — コマンド一覧*

\`/manga レポート\` — 週次レポートを今すぐ生成・投稿
\`/manga コンテ [テーマ]\` — マンガのコンテ・あらすじを生成（例: /manga コンテ 残業中の上司と）
\`/manga キャラ [設定]\` — キャラクター設定シートを生成（例: /manga キャラ 28歳OL、黒髪）
\`/manga キャプション [作品名]\` — BOOTH/FANZA用販売説明文を生成
\`/manga トレンド\` — 今のFANZA/DLsiteトレンドを調査して投稿
\`/manga 進捗 [内容]\` — 制作進捗をチャンネルに記録
\`/manga ヘルプ\` — このヘルプを表示`;
  }

  // レポート
  if (subCmd === "レポート") {
    const report = await callClaude(
      SYSTEM_BASE,
      `<@${userId}> さんのリクエストで週次レポートを生成します。
現在の状況（第1作未着手、OL/お姉さんジャンルでマンガ形式を選定済み）を踏まえ、
今週の優先タスクと制作アドバイスを含むSlack用レポートを作成してください。
冒頭に「<@${userId}> さんリクエスト」と入れてください。`
    );
    await postToSlack(report);
    return ":hourglass: レポートを生成して投稿しました！";
  }

  // コンテ生成
  if (subCmd === "コンテ") {
    const theme = args || "OLと上司の残業";
    const conte = await callClaude(
      SYSTEM_BASE,
      `「${theme}」をテーマにした同人マンガ（OL/お姉さん系）のコンテを作成してください。
以下の形式で出力してください:
- タイトル案（3案）
- あらすじ（100文字）
- 構成（全8〜16ページの各シーン概要）
- 主なセリフ例（2〜3個）
- 推奨タグ（FANZA/DLsite用 10個）`
    );
    await postToSlack(`:pencil: *コンテ生成結果 — テーマ: ${theme}*\n\n${conte}`);
    return ":hourglass: コンテを生成して投稿しました！";
  }

  // キャラクター設定
  if (subCmd === "キャラ") {
    const setting = args || "28歳OL、黒髪ロング、眼鏡";
    const chara = await callClaude(
      SYSTEM_BASE,
      `「${setting}」という設定でOL/お姉さんキャラクターの設定シートを作成してください。
以下の形式で出力してください:
- 名前（名字のみ）
- 年齢・職業・役職
- 外見の詳細（Stable Diffusionプロンプトに使えるように英語でも）
- 性格・口調
- 制作時の一貫性を保つためのポイント
- 推奨プロンプトタグ（英語）`
    );
    await postToSlack(`:bust_in_silhouette: *キャラクター設定 — ${setting}*\n\n${chara}`);
    return ":hourglass: キャラクター設定を生成して投稿しました！";
  }

  // 販売キャプション生成
  if (subCmd === "キャプション") {
    const workTitle = args || "新作マンガ";
    const caption = await callClaude(
      SYSTEM_BASE,
      `「${workTitle}」というタイトルのOL/お姉さん系同人マンガの販売説明文を生成してください。
以下を作成してください:
- BOOTH用説明文（300文字、購買意欲を高めるトーン）
- FANZA用説明文（500文字、詳細な内容説明）
- DLsite用キャッチコピー（50文字以内）
- 検索用タグ（20個）`
    );
    await postToSlack(`:clipboard: *販売説明文 — ${workTitle}*\n\n${caption}`);
    return ":hourglass: 販売説明文を生成して投稿しました！";
  }

  // トレンド調査
  if (subCmd === "トレンド") {
    const trends = await callClaude(
      SYSTEM_BASE,
      "FANZAとDLsiteで現在売れているOL・お姉さんジャンルの同人マンガのトレンドを調べて、" +
      "制作に活かせる具体的なキーワードや傾向を教えてください。",
      true  // web_search 有効
    );
    const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    await postToSlack(`:mag: *FANZAトレンド調査 (${now})*\n\n${trends}`);
    return ":hourglass: トレンド調査結果を投稿しました！";
  }

  // 進捗記録
  if (subCmd === "進捗") {
    if (!args) return "進捗内容を入力してください。例: `/manga 進捗 第1作コンテ完成！12ページ構成に決定`";
    const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    await postToSlack(`:white_check_mark: *制作進捗記録* (${now})\n<@${userId}> より\n\n> ${args}`);
    return ":white_check_mark: 進捗を記録しました！";
  }

  return `不明なコマンド: ${subCmd}\n\`/manga ヘルプ\` でコマンド一覧を確認してください。`;
}

// ── Netlify Function エントリーポイント ────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!verifySlackRequest(event.headers, event.body)) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const params = Object.fromEntries(new URLSearchParams(event.body));
  if (params.type === "url_verification") {
    return { statusCode: 200, body: JSON.stringify({ challenge: params.challenge }) };
  }

  const text   = (params.text || "").trim();
  const userId = params.user_id || "unknown";
  const parts  = text.split(/\s+/);
  const subCmd = parts[0] || "";
  const args   = parts.slice(1).join(" ");

  try {
    const response = await handleCommand(subCmd, args, userId);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_type: "ephemeral", text: response }),
    };
  } catch (err) {
    console.error("Error:", err);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_type: "ephemeral", text: `:warning: エラー: ${err.message}` }),
    };
  }
};
