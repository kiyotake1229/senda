#!/usr/bin/env node
/*
 * 閃打 かな入力（スマホのフリック入力）の自動テスト
 *   node tools/test_kana.js
 *
 * 画面キーボードは「フリックで出せるかな」を送り、「小゛゜」キーで直前のかなを一巡させる。
 * ここではその手順を再現して、お題が最後まで打ち切れるかを検査する。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const mod = { exports: {} };
new Function('module', src)(mod);
const R = mod.exports;
const DECKS = JSON.parse(html.match(/window\.DECKS=(\{.*?\});\n<\/script>/s)[1]);

// キーボードのタップ・フリックで直接出せるかな（12キーの中央と4方向）
const FLICKABLE = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんー、。！？';
let pass = 0, fail = 0; const failures = [];
const ok = (c, name) => { if (c) pass++; else { fail++; if (failures.length < 40) failures.push(name); } };

// 目的のかなを出すための操作列（最初のかな＋「小゛゜」を押す回数）
function tapsFor(ch) {
  if (FLICKABLE.includes(ch)) return [ch];
  const ring = []; let c = ch;
  for (let i = 0; i < 6; i++) { ring.push(c); c = R.kanaCycle(c); if (!c || c === ch) break; }
  const start = ring.find(x => FLICKABLE.includes(x));
  if (!start) return null;
  const out = [start]; let cur = start;
  for (let i = 0; i < 5 && cur !== ch; i++) { cur = R.kanaCycle(cur); out.push(cur); }
  return cur === ch ? out : null;
}

// ---- 1. 「小゛゜」で出せる文字 ----
for (const ch of 'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉっゃゅょゎゔ') {
  const t = tapsFor(ch);
  ok(t && t[t.length - 1] === ch, `小゛゜で ${ch} を出せる`);
}

// ---- 2. 個別のケース ----
const CASES = [
  ['がっこう', ['か', 'が', 'つ', 'っ', 'こ', 'う']],
  ['きゃく', ['き', 'や', 'ゃ', 'く']],
  ['ラーメン', ['ら', 'ー', 'め', 'ん']],
  ['ぎゅうにゅう', ['き', 'ぎ', 'ゆ', 'ゅ', 'う', 'に', 'ゆ', 'ゅ', 'う']],
  ['ヴァイオリン', ['う', 'ぅ', 'ゔ', 'あ', 'ぁ', 'い', 'お', 'り', 'ん']],
  ['こんにちは。', ['こ', 'ん', 'に', 'ち', 'は', '。']],
];
for (const [word, taps] of CASES) {
  const t = R.createKanaTyper(word); let bad = null;
  for (const k of taps) { const r = t.input(k); if (r === 'miss') { bad = k; break } }
  ok(!bad && t.isDone(), `手順どおりに ${word} を打てる${bad ? `（${bad} で失敗）` : ''}`);
}

// ---- 3. 打ち間違い ----
ok(R.createKanaTyper('さくら').input('た') === 'miss', '違うキーはミス');
ok(R.createKanaTyper('が').input('か') === 'ok', '濁点待ちは受理（まだ確定しない）');
{ const t = R.createKanaTyper('か'); t.input('か'); ok(t.isDone(), '「か」は1タップで確定'); }
{ const t = R.createKanaTyper('あい'); t.input('あ'); ok(t.input('う') === 'ok' && !t.isDone(), '同じキーの別の段は受理（途中）'); }

// ---- 4. お題データ全件 ----
let items = 0, skipped = 0;
for (const [deck, d] of Object.entries(DECKS)) {
  if (deck === 'english') continue;
  for (const it of d.items) {
    const kana = it[1];
    if (!R.kanaTypeable(kana)) { skipped++; ok(false, `かなで打てないお題: ${deck} / ${it[0]}（${kana}）`); continue }
    items++;
    const t = R.createKanaTyper(kana); let bad = null;
    for (const ch of kana) {
      const taps = tapsFor(ch);
      if (!taps) { bad = ch; break }
      for (const k of taps) if (t.input(k) === 'miss') { bad = k; break }
      if (bad) break;
    }
    ok(!bad && t.isDone(), `お題: ${deck} / ${it[0]} をフリックで打てない${bad ? `（${bad}）` : ''}`);
  }
}

console.log(`閃打 かな入力のテスト: ${pass} 件合格 / ${fail} 件失敗（お題 ${items} 件、英語以外）`);
if (fail) { for (const f of failures) console.log('  NG ' + f); process.exit(1); }
