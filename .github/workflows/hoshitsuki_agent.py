name: ⭐ 星月占い Weekly Agent

on:
  schedule:
    # 毎週月曜 朝9時 (JST = UTC+9 → UTC 00:00)
    - cron: '0 0 * * 1'
  workflow_dispatch:
    # 手動実行も可能

jobs:
  run-agent:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install anthropic requests

      - name: Run Hoshitsuki Agent
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
          SLACK_CHANNEL_ID: C0APK7S8XQC              # #biz-hoshitsuki
          STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
          X_BEARER_TOKEN: ${{ secrets.X_BEARER_TOKEN }}
          INSTAGRAM_TOKEN: ${{ secrets.INSTAGRAM_TOKEN }}
          INSTAGRAM_USER_ID: ${{ secrets.INSTAGRAM_USER_ID }}
        run: python scripts/hoshitsuki_agent.py
