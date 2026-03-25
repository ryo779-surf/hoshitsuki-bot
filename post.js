const { TwitterApi } = require('twitter-api-v2');

const client = new TwitterApi({
  appKey: process.env.X_API_KEY.trim(),
  appSecret: process.env.X_API_SECRET.trim(),
  accessToken: process.env.X_ACCESS_TOKEN.trim(),
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET.trim(),
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
  '穏やかな一日。焦らずマイペースで進もう。',
  '誠実な姿勢がいい流れを引き寄せる日。',
  '感謝の気持ちを言葉にすることで運気が上がる。',
  '好奇心の赴くままに動いてみると吉。',
  '少し休んで英気を養うことが次の前進に繋がる。',
  '内側の声に耳を傾けてみると、ヒントが見つかる。',
  '今日のキーワードは「対話」。素直に気持ちを伝えて。',
];

const ITEMS = ['クリスタル','コーヒー','白い花','レモン','手帳','丸いもの','鏡','青いペン','ラベンダー','木の実','コイン','貝殻'];

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
  const m = parseInt(String(seed).slice(4,6));
  const day = parseInt(String(seed).slice(6,8));
  console.log('=== 星月占いBot 開始 ' + m + '月' + day + '日 ===');

  for (let i = 0; i < SIGNS.length; i++) {
    const s = SIGNS[i];
    const r = rng(seed + i * 137);
    const msg = MSGS[Math.floor(r() * MSGS.length)];
    const color = s.lucky_color[Math.floor(r() * s.lucky_color.length)];
    const item = ITEMS[Math.floor(r() * ITEMS.length)];
    const stars = Math.floor(r() * 3) + 3;
    const starStr = '★'.repeat(stars) + '☆'.repeat(5 - stars);

    const text = s.emoji + ' ' + s.name + '（' + m + '月' + day + '日）\n今日の運勢 ' + starStr + '\n\n' + msg + '\n\nラッキー: ' + color + '・' + item + '\n\n🔮 詳しい鑑定 → https://hoshitsuki-uranai.netlify.app/\n#今日の運勢 #星占い #タロット #星月占い';

    try {
      await client.v2.tweet(text);
      console.log('✓ ' + s.name + ' 投稿完了');
      await new Promise(r => setTimeout(r, 3000));
    } catch(e) {
      console.error('✗ ' + s.name + ' 失敗: ' + e.message);
    }
  }
  console.log('=== 全星座の投稿完了 ===');
}

main();
