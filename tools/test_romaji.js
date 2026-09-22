#!/usr/bin/env node
/*
 * 閃打 ローマ字入力エンジンの自動テスト
 *   node tools/test_romaji.js          すべてのテストを実行（失敗があれば終了コード 1）
 *
 * エンジン本体は index.html の最初の <script>（romaji.js 相当）。ここではそれを読み込んで検査する。
 * 検査すること:
 *   1. 受理・拒否の表（し=si/shi/ci、ん=n/nn/xn の文脈、っ=子音重ね/xtu など）
 *   2. 最初に表示するローマ字（ヘボン式の既定表示）
 *   3. 打ち方に合わせた表示の切り替え（s→shi、c→chi など）
 *   4. ミスした打鍵で状態が変わらないこと
 *   5. 総当たり: ひらがな1〜2文字のすべての組み合わせで、表示どおりに打てば最後まで打ち切れること、
 *      進み具合（kanaDone）が単調に増えて最後にかなの数と一致すること、各チャンクのどの打ち方も最後まで到達できること
 *   6. お題データ（window.DECKS）の全件が表示どおりに打ち切れること
 */
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const mod = { exports: {} };
new Function('module', scripts[0])(mod);
const R = mod.exports;
const DECKS = (() => { const m = html.match(/window\.DECKS=(\{.*?\});\n<\/script>/s); return JSON.parse(m[1]); })();

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name) { if (cond) pass++; else { fail++; if (failures.length < 60) failures.push(name); } }
function typeAll(kana, typed) {
  const t = R.createTyper(kana); const res = [];
  for (const ch of typed) res.push(t.input(ch));
  return { t, res, accepted: !res.includes('miss') && t.isDone() };
}

// ---- 1. 受理・拒否の表 [かな, 打鍵, 受理するか] ----
const ACCEPT = [
  ['し','si',1],['し','shi',1],['し','ci',1],['ち','ti',1],['ち','chi',1],['つ','tu',1],['つ','tsu',1],['ふ','fu',1],['ふ','hu',1],
  ['じ','ji',1],['じ','zi',1],['ぢ','di',1],['づ','du',1],['づ','dzu',1],['を','wo',1],['ゐ','wi',1],['ゐ','wyi',1],['ゑ','we',1],['ゔ','vu',1],
  ['か','ka',1],['か','ca',1],['く','qu',1],['せ','ce',1],['い','yi',1],['う','wu',1],['う','whu',1],
  ['じゃ','ja',1],['じゃ','jya',1],['じゃ','zya',1],['じゃ','jixya',1],['しゃ','sha',1],['しゃ','sya',1],['しゃ','sixya',1],
  ['ちゃ','cha',1],['ちゃ','tya',1],['ちゃ','cya',1],['きゃ','kya',1],['きゃ','kilya',1],['にゃ','nya',1],['りゅ','ryu',1],
  ['てぃ','thi',1],['てぃ','texi',1],['てぃ','teli',1],['でぃ','dhi',1],['でゅ','dhu',1],['とぅ','twu',1],['どぅ','dwu',1],
  ['ふぁ','fa',1],['ふぁ','fwa',1],['ふぁ','huxa',1],['ふぃ','fi',1],['ふぇ','fe',1],['ふぉ','fo',1],['うぃ','wi',1],['うぃ','whi',1],
  ['うぇ','we',1],['うぉ','who',1],['いぇ','ye',1],['くぁ','qa',1],['くぁ','kwa',1],['ぐぁ','gwa',1],['つぁ','tsa',1],['ゔぁ','va',1],
  ['しぇ','she',1],['ちぇ','che',1],['じぇ','je',1],
  ['ぁ','xa',1],['ぁ','la',1],['ゃ','xya',1],['ゎ','xwa',1],['っ','xtu',1],['っ','ltsu',1],
  // っ（促音）
  ['っか','kka',1],['っか','xtuka',1],['っか','ltuka',1],['っし','sshi',1],['っし','ssi',1],['っち','cchi',1],['っち','tti',1],
  ['っじゃ','jja',1],['っじゃ','zzya',1],['っぷ','ppu',1],['あっ','axtu',1],['あっ','altu',1],['っな','nna',0],['っな','xtuna',1],
  ['っっ','xtuxtu',1],['っあ','xtua',1],['まっちゃ','maccha',1],['まっちゃ','mattya',1],['ちょっと','chotto',1],['いっしょ','issho',1],
  // ん（撥音）
  ['ん','nn',1],['ん','xn',1],['ん','n',0],['かんじ','kanji',1],['かんじ','kannji',1],["かんじ","kan'ji",1],['かんい','kanni',1],['かんい','kani',0],
  ['かんな','kannna',1],["かんな","kan'na",1],['かんな','kanna',0],['ほんや','honnya',1],['ほんや','honya',0],['せんい','senni',1],['せんい','seni',0],
  ['しんぶんし','shinbunshi',1],['しんぶんし','sinbunsi',1],['ラーメン','ra-menn',1],['ラーメン','ra-men',0],['えんじん','enjinn',1],
  // 記号
  ['ー','-',1],['、',',',1],['。','.',1],['！','!',1],['？','?',1],['こーひー','ko-hi-',1],
  // カタカナ・長い語
  ['コーヒー','ko-hi-',1],['エンジン','enjinn',1],['とうきょう','toukyou',1],['ぎゅうにゅう','gyuunyuu',1],['ばっは','bahha',1],
];
for (const [k, typed, exp] of ACCEPT) ok(typeAll(k, typed).accepted === !!exp, `受理表: ${k} を "${typed}" → ${exp ? '受理' : '拒否'}のはず`);

// ---- 2. 最初に表示するローマ字 ----
const PREVIEW = [
  ['し','shi'],['ち','chi'],['つ','tsu'],['ふ','fu'],['じ','ji'],['じゃ','ja'],['しゃ','sha'],['ちゃ','cha'],['ん','nn'],
  ['かんじ','kanji'],['かんい','kanni'],['かんな','kannna'],['ほんや','honnya'],['っか','kka'],['っし','sshi'],['っち','cchi'],
  ['っな','xtuna'],['っっ','xtuxtu'],['んっや','nnyya'],['ラーメン','ra-menn'],['てぃ','thi'],['ふぁ','fa'],['ゔぁ','va'],['を','wo'],
];
for (const [k, exp] of PREVIEW) { const got = R.previewRomaji(k); ok(got === exp, `既定表示: ${k} → ${exp}（実際 ${got}）`); }

// ---- 3. 打ち方に合わせた表示の切り替え ----
function afterTyping(kana, typed) { const t = R.createTyper(kana); for (const ch of typed) t.input(ch); return t.romajiDisplay(); }
const REPLAN = [
  ['し','s','shi'],['し','si','si'],['し','c','ci'],['ち','t','ti'],['ち','c','chi'],['つ','tu','tu'],['ちゃ','t','tya'],['ちゃ','c','cha'],
  ['ちゃ','cy','cya'],['じゃ','z','zya'],['かんじ','kann','kannji'],['っか','x','xtuka'],['ぁ','l','la'],['ふ','h','hu'],
];
for (const [k, typed, exp] of REPLAN) { const got = afterTyping(k, typed); ok(got === exp, `表示の切り替え: ${k} に "${typed}" → ${exp}（実際 ${got}）`); }

// ---- 4. ミスで状態が変わらない ----
for (const k of ['しんぶんし','ちょっと','ふぁみりー','かんい','ぎゅうにゅう','っっあ']) {
  const t = R.createTyper(k);
  for (let step = 0; step < 40 && !t.isDone(); step++) {
    const disp = t.romajiDisplay(), tl = t.typedLength(), kd = t.kanaDone();
    for (const bad of ['q', 'Q', '9', ' ', '@']) {
      if (disp[tl] === bad) continue;
      const r = t.input(bad);
      if (r === 'miss') ok(t.romajiDisplay() === disp && t.typedLength() === tl && t.kanaDone() === kd, `ミス不変: ${k} で "${bad}"`);
    }
    t.input(disp[tl]);
  }
  ok(t.isDone(), `ミス不変: ${k} を打ち切れる`);
}

// ---- 5. 総当たり（1〜2文字） ----
const KANA = [];
for (let c = 0x3041; c <= 0x3096; c++) { const ch = String.fromCharCode(c); if (!'ゝゞゟ'.includes(ch)) KANA.push(ch); }
KANA.push('ー');
function checkWord(w) {
  const t = R.createTyper(w); const disp = t.romajiDisplay();
  if (!/^[\x20-\x7e]+$/.test(disp)) { ok(false, `総当たり: ${w} の表示に打てない文字 ${disp}`); return; }
  let last = 0, mono = true;
  for (const ch of disp) { if (t.input(ch) === 'miss') { ok(false, `総当たり: ${w} を表示 ${disp} どおりに打てない`); return; } const kd = t.kanaDone(); if (kd < last) mono = false; last = kd; }
  ok(t.isDone() && t.kanaDone() === t.kana.length && mono, `総当たり: ${w} の進み具合`);
  // 各チャンクの打ち方がすべて到達可能（直前の打ち方の途中で確定してしまわない）
  for (const chunk of t.chunks) {
    for (const v of chunk.variants) {
      if (v.r.includes("'")) continue;
      const shadow = chunk.variants.some(o => o !== v && o.r.length < v.r.length && v.r.startsWith(o.r));
      ok(!shadow, `総当たり: ${w} の打ち方 ${v.r} が短い打ち方に隠れる`);
    }
  }
}
let words = 0;
for (const a of KANA) { checkWord(a); words++; for (const b of KANA) { checkWord(a + b); words++; } }

// ---- 6. お題データ全件 ----
let items = 0;
for (const [k, d] of Object.entries(DECKS)) for (const it of d.items) {
  items++;
  const t = R.createTyper(it[1]); const disp = t.romajiDisplay(); let good = /^[\x20-\x7e]+$/.test(disp);
  if (good) for (const ch of disp) if (t.input(ch) === 'miss') { good = false; break; }
  ok(good && t.isDone(), `お題: ${k} / ${it[0]} を表示 ${disp} どおりに打てない`);
}

console.log(`閃打 ローマ字エンジンのテスト: ${pass} 件合格 / ${fail} 件失敗（総当たり ${words} 語、お題 ${items} 件を含む）`);
if (fail) { for (const f of failures) console.log('  NG ' + f); process.exit(1); }
