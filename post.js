const { TwitterApi } = require('twitter-api-v2');

console.log('=== 星月占いBot 起動 ===');
console.log('API Key:', process.env.X_API_KEY ? process.env.X_API_KEY.slice(0,6)+'...' : 'MISSING');
console.log('API Secret:', process.env.X_API_SECRET ? 'SET' : 'MISSING');
console.log('Access Token:', process.env.X_ACCESS_TOKEN ? process.env.X_ACCESS_TOKEN.slice(0,8)+'...' : 'MISSING');
console.log('Access Token Secret:', process.env.X_ACCESS_TOKEN_SECRET ? 'SET' : 'MISSING');

const client = new TwitterApi({
  appKey: process.env.X_API_KEY.trim(),
  appSecret: process.env.X_API_SECRET.trim(),
  accessToken: process.env.X_ACCESS_TOKEN.trim(),
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET.trim(),
});

async function main() {
  const text = '♈ テスト投稿 ' + new Date().toISOString() + ' \n\n星月占いBot 動作確認中\n\n#星月占い #テスト';
  console.log('投稿テキスト:', text);
  try {
    const result = await client.v2.tweet(text);
    console.log('✓ 投稿成功! ID:', result.data.id);
  } catch(e) {
    console.error('✗ エラー code:', e.code);
    console.error('✗ エラーメッセージ:', e.message);
    console.error('✗ エラーデータ:', JSON.stringify(e.data, null, 2));
    process.exit(1);
  }
}
main();
