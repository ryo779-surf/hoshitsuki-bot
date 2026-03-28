"""
AI生成コンテンツ事業 (FANZA/DLsite) — Full Agent v1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
週次スケジュール実行 (毎週月曜 朝9時15分 JST):
  1. BOOTH 売上・アクセス状況の確認促進
  2. 制作進捗のチェック（作品数・ステータス）
  3. FANZA/DLsite ランキングトレンド分析（Web検索）
  4. 週次レポート + 今週の制作タスクを #biz-ai-content に投稿

必要な環境変数 (GitHub Secrets):
  ANTHROPIC_API_KEY   - Anthropic APIキー
  SLACK_BOT_TOKEN     - Slack Bot Token
  SLACK_CHANNEL_ID    - #biz-ai-content のチャンネルID (C0APK7TAXDJ)
"""

import os
import json
import requests
from datetime import datetime, timezone, timedelta
import anthropic

# ══════════════════════════════════════════
#  設定
# ══════════════════════════════════════════
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
SLACK_BOT_TOKEN   = os.environ["SLACK_BOT_TOKEN"]
SLACK_CHANNEL_ID  = os.environ["SLACK_CHANNEL_ID"]

JST   = timezone(timedelta(hours=9))
now   = datetime.now(JST)
today = now.strftime("%Y年%m月%d日")

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# ══════════════════════════════════════════
#  事業状態ファイル（制作進捗を管理）
#  GitHubリポジトリの production_status.json を更新して進捗を記録する
# ══════════════════════════════════════════
DEFAULT_STATUS = {
    "strategy": {
        "genre": "OL/お姉さん系",
        "format": "マンガ形式",
        "release_order": "BOOTH先行 → FANZA/DLsite本番"
    },
    "works": [
        # 例: {"title": "第1作タイトル", "status": "企画中|制作中|完成|BOOTH出品|FANZA申請中|販売中", "platform": "", "sales": 0}
    ],
    "total_sales_jpy": 0,
    "notes": ""
}

def load_status() -> dict:
    """production_status.json があれば読み込む。なければデフォルト値を返す"""
    status_path = os.path.join(os.path.dirname(__file__), "..", "production_status.json")
    if os.path.exists(status_path):
        with open(status_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return DEFAULT_STATUS


# ══════════════════════════════════════════
#  1. Claude web_search でFANZAトレンド調査
#     （Claude の web_search ツールを活用）
# ══════════════════════════════════════════
def fetch_fanza_trends() -> str:
    """FANZAのOL・お姉さんジャンルの直近トレンドをClaude web_searchで取得"""
    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            tools=[{"type": "web_search_20250305", "name": "web_search"}],
            messages=[{
                "role": "user",
                "content": (
                    "FANZAまたはDLsiteで現在売れているOL・お姉さんジャンルの同人マンガの"
                    "トレンドや人気キーワードを調べて、100文字以内で箇条書きで教えてください。"
                )
            }]
        )
        # テキストブロックのみ抽出
        result = ""
        for block in message.content:
            if block.type == "text":
                result += block.text
        return result.strip() or "トレンド取得スキップ（検索結果なし）"
    except Exception as e:
        return f"トレンド取得スキップ（エラー: {e}）"


# ══════════════════════════════════════════
#  2. 週次レポート生成
# ══════════════════════════════════════════
def generate_weekly_report(status: dict, trends: str) -> str:
    works = status.get("works", [])
    works_summary = json.dumps(works, ensure_ascii=False, indent=2) if works else "まだ作品なし（第1作企画中）"

    prompt = f"""
あなたは「AI生成コンテンツ事業（FANZA/DLsite向け同人マンガ）」の事業エージェントです。
今日は {today} です。以下の状況をもとに週次レポートをSlack用に作成してください。

【事業戦略】
- ジャンル: OL/お姉さん系（需要・単価バランス最適）
- 形式: マンガ形式（CGより高単価・高販売数）
- リリース戦略: BOOTH先行テスト → FANZA/DLsite本番展開
- 制作環境: Google Colab Pro (A100) + HuggingFace (ryo779)

【作品制作状況】
{works_summary}

【今週の累計売上】
¥{status.get('total_sales_jpy', 0):,}

【FANZAトレンド調査結果】
{trends}

【備考】
{status.get('notes', 'なし')}

以下フォーマットで出力してください:

:robot_face: *AI生成コンテンツ事業 — 週次レポート {today}*

:bar_chart: *制作状況サマリー*
（作品数・各ステータスを簡潔に。作品がなければ「第1作の制作開始が最重要タスク」と明記）

:moneybag: *売上状況*
（累計売上と前週比。まだ販売前なら「¥0 — 初リリース待ち」と記載）

:fire: *FANZAトレンド — 今週注目キーワード*
（トレンド情報から制作に活かせるポイントを2〜3行で）

:dart: *今週やること TOP3*
（制作フェーズに応じた具体的なアクション。第1作未着手なら「コンテ作成→キャラ設定→画像生成」の順）

:bulb: *エージェントからの提案*
（トレンドと現状を踏まえた制作・販売戦略アドバイスを1〜2文で）

Slack投稿テキストのみ出力。コードブロック不要。
"""

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )
    return message.content[0].text


# ══════════════════════════════════════════
#  3. Slack に投稿
# ══════════════════════════════════════════
def post_to_slack(text: str):
    resp = requests.post(
        "https://slack.com/api/chat.postMessage",
        headers={"Authorization": f"Bearer {SLACK_BOT_TOKEN}", "Content-Type": "application/json"},
        json={"channel": SLACK_CHANNEL_ID, "text": text}
    )
    result = resp.json()
    if not result.get("ok"):
        raise RuntimeError(f"Slack投稿失敗: {result.get('error')}")
    print(f"✅ Slack投稿成功: ts={result['ts']}")


# ══════════════════════════════════════════
#  メイン
# ══════════════════════════════════════════
if __name__ == "__main__":
    print(f"🤖 AI生成コンテンツエージェント v1 起動 ({today})")

    print("\n📂 [1/3] 制作進捗ファイル読み込み中...")
    status = load_status()
    print(f"  → 作品数: {len(status.get('works', []))}件")

    print("\n🔍 [2/3] FANZAトレンド調査中（Claude web_search）...")
    trends = fetch_fanza_trends()
    print(f"  → {trends[:80]}...")

    print("\n✍️  [3/3] Claude でレポート生成中...")
    report = generate_weekly_report(status, trends)
    print("\n--- 生成レポート ---")
    print(report)
    print("-------------------\n")

    print("📤 Slackに投稿中...")
    post_to_slack(report)

    print("\n✅ 完了!")
