#!/usr/bin/env python3
"""閃打のお題データ（index.html 内の window.DECKS）を検査する。

使い方（タイピングゲーム/ で実行）:
  python3 tools/check_decks.py          形式・送り仮名の整合・重複・打てるかを検査
  python3 tools/check_decks.py --mac    さらに macOS の日本語解析と読みを突き合わせる（macOS のみ・初回は数十秒）

検査項目:
  - よみ: ひらがな・ー・、。！？ だけか（English は表示と同じ文字列か、使える記号だけか）
  - 表示とよみの整合: 表示の中の仮名・記号が、よみの同じ位置に同じ順で現れるか（送り仮名や句読点の食い違いを検出）
  - 長さ・重複（デッキをまたいだ重複も）
  - ローマ字エンジン: 表示されるローマ字どおりに打って最後まで打ち切れるか（node が必要）
  - 意味（3つ目の要素。ことわざ・四字熟語のみ）: 8〜48字、英数字・かっこ・句点なし
  - --mac: macOS の読みと違うものを一覧にする。連濁（〜がわ・〜じま など）で macOS が誤ることが多いので、
           一覧は「人が目で確認する候補」。同じ仮名の抜け（ししたの→したの 等）の発見に効く
終了コード: 形式エラーがあれば 1
"""
import json, re, sys, os, subprocess, tempfile, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, 'index.html')
LEN = {'basic': (2, 8), 'katakana': (2, 12), 'nature': (2, 10), 'sushi': (2, 16), 'place': (2, 12), 'business': (2, 18),
       'kotowaza': (4, 20), 'tech': (2, 14), 'short': (10, 26), 'long': (20, 52)}
KANA_RE = re.compile(r'^[ぁ-ゖー、。！？]+$')
EN_RE = re.compile(r"^[A-Za-z ,.'!?\-]+$")
KANJI = r'[㐀-鿿豈-﫿々〆ヶ]'
TEXT_OK = re.compile(r'^(?:' + KANJI + r'|[ぁ-ゖァ-ヺー、。！？])+$')


def k2h(s):
    # ヶ（茅ヶ崎・八ヶ岳 など）は「が」「か」と読むので仮名にせず、漢字と同じに扱う
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヴ' else c for c in s)


def consistent(text, kana):
    t = k2h(text)
    pat = ''
    for m in re.finditer(KANJI + r'+|[^㐀-鿿豈-﫿々〆ヶ]+', t):
        seg = m.group(0)
        pat += ('.{%d,%d}' % (len(seg), 5 * len(seg))) if re.match(KANJI, seg) else re.escape(seg)
    return re.fullmatch(pat, kana) is not None


def load():
    html = open(HTML, encoding='utf-8').read()
    decks = json.loads(re.search(r'window\.DECKS=(\{.*?\});\n</script>', html, re.S).group(1))
    engine = re.findall(r'<script>([\s\S]*?)</script>', html)[0]
    return decks, engine


def engine_check(engine, rows):
    js = r"""const R=require(process.argv[1]);const data=JSON.parse(require('fs').readFileSync(0,'utf8'));const bad=[];
for(const [k,t,kn] of data){const ty=R.createTyper(kn);const d=ty.romajiDisplay();
if(!/^[\x20-\x7e]+$/.test(d)){bad.push([k,t,'表示に打てない文字: '+d]);continue}
let ok=true;for(const c of d){if(ty.input(c)==='miss'){ok=false;break}}if(!ok||!ty.isDone())bad.push([k,t,'表示どおりに打ち切れない: '+d])}
console.log(JSON.stringify(bad));"""
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f:
        f.write(engine)
        path = f.name
    try:
        r = subprocess.run(['node', '-e', js, path], input=json.dumps(rows, ensure_ascii=False), capture_output=True, text=True)
        return json.loads(r.stdout or '[]')
    finally:
        os.unlink(path)


def mac_readings(texts):
    exe = os.path.join(tempfile.gettempdir(), 'senda_reading')
    src = os.path.join(ROOT, 'tools', 'reading.swift')
    if not os.path.exists(exe) or os.path.getmtime(exe) < os.path.getmtime(src):
        subprocess.run(['swiftc', '-O', src, '-o', exe], check=True)
    r = subprocess.run([exe], input=json.dumps(texts, ensure_ascii=False), capture_output=True, text=True)
    return json.loads(r.stdout)


V = {}
for row, vs in [('あかさたなはまやらわがざだばぱぁゃゎ', 'a'), ('いきしちにひみりぎじぢびぴぃ', 'i'), ('うくすつぬふむゆるぐずづぶぷぅゅゔ', 'u'),
                ('えけせてねへめれげぜでべぺぇ', 'e'), ('おこそとのほもよろをごぞどぼぽぉょ', 'o')]:
    for ch in row:
        V[ch] = vs


def canon(s):
    s = re.sub(r'[、。！？､｡!?,.\s　・]', '', k2h(s))
    o = []
    for ch in s:
        v = V.get(o[-1], '') if o else ''
        if ch == 'ー' and v:
            ch = 'あいうえお'['aiueo'.index(v)]
        elif ch == 'う' and v == 'o':
            ch = 'お'
        elif ch == 'い' and v == 'e':
            ch = 'え'
        o.append(ch)
    return ''.join(o)


def main():
    decks, engine = load()
    errors = []
    seen = {}
    rows = []
    for k, d in decks.items():
        for item in d['items']:
            t, kn = item[0], item[1]
            if len(item) > 2:
                mean = item[2]
                if not isinstance(mean, str) or not (8 <= len(mean) <= 48) or re.search(r'[a-zA-Z0-9「」『』（）()。]', mean):
                    errors.append((k, t, f'意味の形式が不正: {mean}'))
            if t in seen:
                errors.append((k, t, f'重複（{seen[t]} にもある）'))
            seen.setdefault(t, k)
            if k == 'english':
                if kn != t or not EN_RE.match(t):
                    errors.append((k, t, '英語の文字・よみが不正'))
            else:
                if not KANA_RE.match(kn):
                    errors.append((k, t, 'よみに使えない文字'))
                elif not TEXT_OK.match(t):
                    errors.append((k, t, '表示に使えない文字'))
                elif not consistent(t, kn):
                    errors.append((k, t, f'表示とよみが食い違う: {kn}'))
                elif k in LEN and not (LEN[k][0] <= len(kn) <= LEN[k][1]):
                    errors.append((k, t, f'長さが範囲外: {len(kn)}'))
            rows.append((k, t, kn))
    errors += [tuple(x) for x in engine_check(engine, rows)]
    counts = {k: len(d['items']) for k, d in decks.items()}
    print('デッキ:', counts, '合計', sum(counts.values()))
    print('形式エラー:', len(errors))
    for e in errors:
        print('  ', ' | '.join(e))
    if '--mac' in sys.argv:
        ja = [(k, t, kn) for k, t, kn in rows if k != 'english']
        mac = mac_readings([t for _, t, _ in ja])
        diff = [(k, t, kn, m) for (k, t, kn), m in zip(ja, mac) if canon(kn) != canon(m)]
        print(f'macOS の読みと違うもの（目視確認の候補）: {len(diff)} / {len(ja)}')
        for k, t, kn, m in diff:
            print(f'   {k} | {t} | {kn} | macOS: {m}')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
