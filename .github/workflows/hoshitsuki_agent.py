"""
星月占い (Hoshitsuki Uranai) — Full Agent v2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
週次スケジュール実行 (毎週月曜 朝9時 JST):
  1. Stripe 売上集計 → Claudeが分析・コメント生成
  2. X (@hoshitsuki_u) 投稿効果測定 → 高反応コンテンツ特定
  3. Instagram フォロワー・エンゲージメント取得（実装後に有効）
  4. 上記データを統合して週次レポートを #biz-hoshitsuki に投稿

必要な環境変数 (GitHub Secrets):
  ANTHROPIC_API_KEY   - Anthropic APIキー
  SLACK_BOT_TOKEN     - Slack Bot Token (xoxb-...)
  SLACK_CHANNEL_ID    - #biz-hoshitsuki のチャンネルID
  STRIPE_SECRET_KEY   - Stripe シークレットキー
  X_BEARER_TOKEN      - X (Twitter) Bearer Token
  INSTAGRAM_TOKEN     - Instagram Graph API トークン（任意）
  INSTAGRAM_USER_ID   - Instagram ユーザーID（任意）
"""

import os
import json
import requests
from datetime import datetime, timezone, timedelta
import anthropic

# ══════════════════════════════════════════
#  設定
# ══════════════════════════════════════════
ANTHROPIC_API_KEY  = os.environ["ANTHROPIC_API_KEY"]
SLACK_BOT_TOKEN    = os.environ["SLACK_BOT_TOKEN"]
SLACK_CHANNEL_ID   = os.environ["SLACK_CHANNEL_ID"]
STRIPE_SECRET_KEY  = os.environ.get("STRIPE_SECRET_KEY", "")
X_BEARER_TOKEN     = os.environ.get("X_BEARER_TOKEN", "")
INSTAGRAM_TOKEN    = os.environ.get("INSTAGRAM_TOKEN", "")
INSTAGRAM_USER_ID  = os.environ.get("INSTAGRAM_USER_ID", "")
X_USERNAME         = "hoshitsuki_u"

JST   = timezone(timedelta(hours=9))
now   = datetime.now(JST)
today = now.strftime("%Y年%m月%d日")

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# ══════════════════════════════════════════
#  1. Stripe 売上集計
# ══════════════════════════════════════════
def fetch_stripe_revenue() -> dict:
    """過去7日間の売上をStripe APIから取得"""
    if not STRIPE_SECRET_KEY:
        return {"error": "STRIPE_SECRET_KEY未設定", "revenue": 0, "count": 0}

    week_ago = int((now - timedelta(days=7)).timestamp())
    try:
        resp = requests.get(
            "https://api.stripe.com/v1/payment_intents",
            auth=(STRIPE_SECRET_KEY, ""),
            params={"created[gte]": week_ago, "limit": 100}
        )
        data = resp.json()
        if "error" in data:
            return {"error": data["error"]["message"], "revenue": 0, "count": 0}

        payments = [p for p in data.get("data", []) if p.get("status") == "succeeded"]
        total_jpy = sum(p["amount"] for p in payments)
        return {
            "revenue": total_jpy,
            "count": len(payments),
            "payments": [
                {"amount": p["amount"], "created": datetime.fromtimestamp(p["created"], JST).strftime("%m/%d")}
                for p in payments[:5]
            ]
        }
    except Exception as e:
        return {"error": str(e), "revenue": 0, "count": 0}


# ══════════════════════════════════════════
#  2. X (Twitter) 投稿効果測定
# ══════════════════════════════════════════
def fetch_x_metrics() -> dict:
    """過去7日間の投稿メトリクスを取得"""
    if not X_BEARER_TOKEN:
        return {"error": "X_BEARER_TOKEN未設定", "tweets": []}

    try:
        # ユーザーIDを取得
        user_resp = requests.get(
            f"https://api.twitter.com/2/users/by/username/{X_USERNAME}",
            headers={"Authorization": f"Bearer {X_BEARER_TOKEN}"}
        )
        user_id = user_resp.json().get("data", {}).get("id")
        if not user_id:
            return {"error": "ユーザーID取得失敗", "tweets": []}

        # 過去7日のツイートを取得
        week_ago = (now - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
        tweets_resp = requests.get(
            f"https://api.twitter.com/2/users/{user_id}/tweets",
            headers={"Authorization": f"Bearer {X_BEARER_TOKEN}"},
            params={
                "max_results": 10,
                "start_time": week_ago,
                "tweet.fields": "public_metrics,created_at,text",
            }
        )
        tweets = tweets_resp.json().get("data", [])

        result = []
        for t in tweets:
            m = t.get("public_metrics", {})
            result.append({
                "text": t["text"][:80] + ("..." if len(t["text"]) > 80 else ""),
                "impressions": m.get("impression_count", 0),
                "likes": m.get("like_count", 0),
                "retweets": m.get("retweet_count", 0),
                "date": t.get("created_at", "")[:10],
            })

        result.sort(key=lambda x: x["impressions"], reverse=True)
        return {"tweets": result, "total": len(result)}

    except Exception as e:
        return {"error": str(e), "tweets": []}


# ══════════════════════════════════════════
#  3. Instagram メトリクス取得
# ══════════════════════════════════════════
def fetch_instagram_metrics() -> dict:
    """フォロワー数・直近投稿エンゲージメントを取得"""
    if not INSTAGRAM_TOKEN or not INSTAGRAM_USER_ID:
        return {"error": "Instagram API未設定 (実装後に有効化)", "followers": 0}

    try:
        account_resp = requests.get(
            f"https://graph.instagram.com/{INSTAGRAM_USER_ID}",
            params={"fields": "followers_count,media_count", "access_token": INSTAGRAM_TOKEN}
        )
        account = account_resp.json()

        media_resp = requests.get(
            f"https://graph.instagram.com/{INSTAGRAM_USER_ID}/media",
            params={
                "fields": "caption,like_count,comments_count,timestamp",
                "limit": 5,
                "access_token": INSTAGRAM_TOKEN
            }
        )

        posts = []
        for m in media_resp.json().get("data", []):
            posts.append({
                "caption": (m.get("caption", "")[:60] + "...") if m.get("caption") else "(キャプションなし)",
                "likes": m.get("like_count", 0),
                "comments": m.get("comments_count", 0),
                "date": m.get("timestamp", "")[:10],
            })

        return {
            "followers": account.get("followers_count", 0),
            "media_count": account.get("media_count", 0),
            "posts": posts,
        }
    except Exception as e:
        return {"error": str(e), "followers": 0}


# ══════════════════════════════════════════
#  4. Claude で週次レポート生成
# ══════════════════════════════════════════
def generate_weekly_report(stripe: dict, x_metrics: dict, instagram: dict) -> str:
    """全データを統合してClaudeが週次レポートを生成"""

    data_summary = f"""
【Stripe 売上データ（過去7日）】
{json.dumps(stripe, ensure_ascii=False, indent=2)}

【X (@hoshitsuki_u) 投稿パフォーマンス（過去7日）】
{json.dumps(x_metrics, ensure_ascii=False, indent=2)}

【Instagram メトリクス】
{json.dumps(instagram, ensure_ascii=False, indent=2)}
"""

    prompt = f"""
あなたは「星月占い（AIタロット占いサービス）」の事業エージェントです。
今日は {today} です。以下の実データをもとに週次レポートをSlack用に作成してください。

{data_summary}

【事業の現在フォーカス】
- Instagram Graph API の自動化が最優先の未完了タスク
- LINEからStripeへの有料コンバージョン改善
- X投稿の反応が良いコンテンツの傾向分析

以下フォーマットで、具体的な数値と鋭いアドバイスを含めて出力してください:

:star2: *星月占い — 週次レポート {today}*

:moneybag: *今週の売上*
（Stripeデータから具体的な数値を記載。データ未取得の場合はその旨を記載）

:bird: *X投稿 — 今週のハイライト*
（最もインプレッションが高かった投稿内容・数値、傾向コメント）

:camera: *Instagram*
（フォロワー数・エンゲージメント。未連携なら実装を促すコメント）

:dart: *今週やること TOP3*
（データと事業状況から導いた具体的な優先アクション3つ）

:bulb: *エージェントからの提案*
（データを見て気づいた改善点・チャンスを1〜2文で端的に）

Slack投稿テキストのみ出力。コードブロック不要。
"""

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )
    return message.content[0].text


# ══════════════════════════════════════════
#  5. Slack に投稿
# ══════════════════════════════════════════
def post_to_slack(text: str, thread_ts: str = None):
    payload = {"channel": SLACK_CHANNEL_ID, "text": text}
    if thread_ts:
        payload["thread_ts"] = thread_ts

    resp = requests.post(
        "https://slack.com/api/chat.postMessage",
        headers={"Authorization": f"Bearer {SLACK_BOT_TOKEN}", "Content-Type": "application/json"},
        json=payload
    )
    result = resp.json()
    if not result.get("ok"):
        raise RuntimeError(f"Slack投稿失敗: {result.get('error')}")
    print(f"✅ Slack投稿成功: ts={result['ts']}")
    return result["ts"]


# ══════════════════════════════════════════
#  メイン
# ══════════════════════════════════════════
if __name__ == "__main__":
    print(f"🤖 星月占いエージェント v2 起動 ({today})")

    print("\n📊 [1/3] Stripe 売上データ取得中...")
    stripe_data = fetch_stripe_revenue()
    print(f"  → 売上: ¥{stripe_data.get('revenue', 0):,} / {stripe_data.get('count', 0)}件")

    print("\n🐦 [2/3] X メトリクス取得中...")
    x_data = fetch_x_metrics()
    print(f"  → ツイート数: {x_data.get('total', 0)}件")

    print("\n📸 [3/3] Instagram メトリクス取得中...")
    ig_data = fetch_instagram_metrics()
    print(f"  → フォロワー: {ig_data.get('followers', 0)}人")

    print("\n✍️  Claude でレポート生成中...")
    report = generate_weekly_report(stripe_data, x_data, ig_data)
    print("\n--- 生成レポート ---")
    print(report)
    print("-------------------\n")

    print("📤 Slackに投稿中...")
    post_to_slack(report)

    print("\n✅ 完了!")
