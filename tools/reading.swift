// tools/check_decks.py --mac から使う。macOS 標準の日本語解析で、表示文の読み（ひらがな）を出す。
import Foundation
// stdin: JSON array of strings. stdout: JSON array of hiragana readings from macOS's Japanese tokenizer.
let data = FileHandle.standardInput.readDataToEndOfFile()
let texts = try! JSONSerialization.jsonObject(with: data) as! [String]
let locale = CFLocaleCreate(nil, CFLocaleIdentifier("ja_JP" as CFString))
var out: [String] = []
for text in texts {
    let cf = text as CFString
    let tok = CFStringTokenizerCreate(nil, cf, CFRangeMake(0, CFStringGetLength(cf)), kCFStringTokenizerUnitWordBoundary, locale)
    var result = ""
    var type = CFStringTokenizerAdvanceToNextToken(tok)
    while type != [] {
        let r = CFStringTokenizerGetCurrentTokenRange(tok)
        let sub = CFStringCreateWithSubstring(nil, cf, r)! as String
        if let latin = CFStringTokenizerCopyCurrentTokenAttribute(tok, kCFStringTokenizerAttributeLatinTranscription) as? String {
            let m = NSMutableString(string: latin)
            CFStringTransform(m, nil, kCFStringTransformLatinHiragana, false)
            result += m as String
        } else { result += sub }
        type = CFStringTokenizerAdvanceToNextToken(tok)
    }
    out.append(result)
}
FileHandle.standardOutput.write(try! JSONSerialization.data(withJSONObject: out, options: []))
