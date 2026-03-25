const { TwitterApi } = require('twitter-api-v2');

console.log('=== 星月占いBot 起動 ===');
console.log('API Key exists:', !!process.env.X_API_KEY);
console.log('API Secret exists:', !!process.env.X_API_SECRET);
console.log('Access Token exists:', !!process.env.X_ACCESS_TOKEN);
console.log('Access Token Secret exists:', !!process.env.X_ACCESS_TOKEN_SECRET);

const client = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
});

const SIGNS = [
  { name: '牡羊座', emoji: '♈', lucky_color: ['赤', '朱色'] },
  { name: '牡牛座', emoji: '♉', lucky_color: ['緑', 'ピンク'] },
  { name: '双子座', emoji: '♊', lucky_color: ['黄色', '水色'] },
  { name: '蟹座',   emoji: '♋', lucky_color: ['白', 'シルバー'] },
  { name: '獅子座', emoji: '♌', lucky_color: ['金', 'オレンジ'] },
  { name: '乙女座', emoji: '♍', lucky_color: ['紺', 'グリーン'] },
  { name: '天秤座', emoji: '♎', lucky_color: ['ピンク', 'ブルー'] },
  { name: '蠍座',   emoji: '♏', lucky_color: ['深紅', '黒'] },
  { name: '射手座', emoji: '♐', lucky_color: ['紫', 'ターコイズ'] },
  { name: '山羊座', emoji: '♑', lucky_color: ['茶', '黒'] },
  { name: '水瓶座', emoji: '♒', lucky_color: ['ブルー', 'シルバー'] },
  { name: '魚座',   emoji: '♓', lucky_color: ['水色', 'ラベンダー'] },
];

const MSGS = [
  '流れに乗る日。直感を信じて動いてみて。',
  '今日は立ち止まって振り返る時間を大切に。',
  '新しい出会いや縁が生まれやすい一日。',
  'コツコツの積み重ねが実を結ぶタイミング。',
  'エネルギーが高まっている。思い切って挑戦を。',
  '誠実な姿勢がいい流れを引き寄せる日。',
  '感謝の気持ちを言葉にすることで運気が上がる。',
  '好奇心の赴くままに動いてみると吉。',
];

const ITEMS = ['クリスタル','コーヒー','白い花','レモン','手帳','丸いもの','鏡','青いペン'];

function rng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function today() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return parseInt(d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0'));
}

async function main() {
  const seed = today();
  console.log('日付シード:', seed);
  const m = parseInt(String(seed).slice(4,6));
  const day = parseInt(String(seed).slice(6,8));
  const rw = client.readWrite;

  // まず1星座だけテスト投稿
  const s = SIGNS[0];
  const r = rng(seed);
  const msg = MSGS[Math.floor(r() * MSGS.length)];
  const color = s.lucky_color[Math.floor(r() * s.lucky_color.length)];
  const item = ITEMS[Math.floor(r() * ITEMS.length)];
  const stars = '★'.repeat(Math.floor(r() * 3) + 3) + '☆'.repeat(2);
  const text = s.emoji + ' ' + s.name + '（' + m + '月' + day + '日）\n今日の運勢 ' + stars + '\n\n' + msg + '\n\nラッキー: ' + color + '・' + item + '\n\n🔮 詳しい鑑定 → https://hoshitsuki-uranai.netlify.app/\n#今日の運勢 #星占い #タロット #星月占い';

  console.log('投稿内容プレビュー:');
  console.log(text);
  console.log('---');

  try {
    const result = await rw.v2.tweet(text);
    console.log('✓ 投稿成功! ID:', result.data.id);
  } catch(e) {
    console.error('✗ 投稿失敗:', e.message);
    console.error('エラー詳細:', JSON.stringify(e.data || e, null, 2));
    process.exit(1);
  }
}

main();
