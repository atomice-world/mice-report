// AI 낭독용 발음 변환: 숫자·영문 약어·한자를 한글 읽기로 바꾼다 (Supertonic은 텍스트 정규화가 거의 없음).
// segments.mjs가 new Function으로 읽어 쓰고, 로컬 점검 시 REPL에서 eval 해도 된다. function pron(text) -> string
function pron(text) {
  var D = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  function sino(n) {
    n = Math.floor(Number(n)); if (!isFinite(n)) return String(n); if (n === 0) return '영';
    var big = ['', '만', '억', '조'], out = '', g = 0;
    while (n > 0) {
      var part = n % 10000, s = '';
      if (part) {
        var th = Math.floor(part / 1000), hu = Math.floor(part / 100) % 10, te = Math.floor(part / 10) % 10, on = part % 10;
        if (th) s += (th === 1 ? '' : D[th]) + '천';
        if (hu) s += (hu === 1 ? '' : D[hu]) + '백';
        if (te) s += (te === 1 ? '' : D[te]) + '십';
        if (on) s += D[on];
        if (g === 1 && part === 1) s = '';
        out = s + big[g] + (out ? ' ' + out : '');
      }
      n = Math.floor(n / 10000); g++;
    }
    return out.trim();
  }
  var ONE = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉'], TEN = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
  function native(n) { n = +n; if (n === 20) return '스무'; if (n < 1 || n > 99) return sino(n); return TEN[Math.floor(n / 10)] + ONE[n % 10]; }
  function hour(h, m) {
    h = +h; var s;
    if (h === 0 || h === 24) s = '밤 열두시'; else if (h === 12) s = '낮 열두시'; else if (h > 12) s = '오후 ' + native(h - 12) + '시'; else s = native(h) + '시';
    if (m && +m) s += ' ' + sino(+m) + '분';
    return s;
  }
  var DICT = {
    'K-MICE': '케이마이스', 'MICE': '마이스', 'PCO': '피씨오', 'KAPCO': '캅코', 'KMA': '케이엠에이', 'KME': '케이엠이', 'AI': '에이아이',
    'R&D': '알앤디', 'IEEE': '아이트리플이', 'ICCA': '아이카', 'CPTPP': '씨피티피피', 'CAU': '씨에이유', 'GTC': '지티씨', 'SK': '에스케이',
    'LG': '엘지', 'WIDE': '와이드', 'WEEK': '위크', 'The': '더', 'Networking': '네트워킹', 'Day': '데이', 'Next': '넥스트', 'Tech': '테크',
    'Frontiers': '프런티어스', 'Medical': '메디컬', 'Korea': '코리아', 'in': '인', 'eGRID': '이그리드', 'PROMICE': '프로마이스', 'Forum': '포럼',
    'Online': '온라인', 'GUMI': '구미', 'Education': '에듀케이션', 'Show': '쇼', 'B2B': '비투비', 'VAT': '부가세', 'TV': '티비', 'IT': '아이티',
    'ESG': '이에스지', 'COEX': '코엑스', 'BEXCO': '벡스코', 'EXCO': '엑스코', 'KINTEX': '킨텍스', 'UN': '유엔', 'OECD': '오이시디', 'APEC': '에이펙',
    'ASEAN': '아세안', 'NEAR': '니어', 'KOICA': '코이카', 'KOTRA': '코트라', 'MOU': '엠오유', 'CEO': '씨이오', 'PR': '피알', 'IR': '아이알',
    'WIDE ': '와이드', 'Asia': '아시아', 'Global': '글로벌', 'Connect': '커넥트', 'IoT': '아이오티', 'Expo': '엑스포', 'Conference': '컨퍼런스',
    'Summit': '서밋', 'Week': '위크', 'Fair': '페어', 'Smart': '스마트', 'City': '시티', 'Seoul': '서울', 'Busan': '부산', 'Incheon': '인천',
    'G': '지', 'K': '케이'
  };
  var L = { A: '에이', B: '비', C: '씨', D: '디', E: '이', F: '에프', G: '지', H: '에이치', I: '아이', J: '제이', K: '케이', L: '엘', M: '엠', N: '엔', O: '오', P: '피', Q: '큐', R: '알', S: '에스', T: '티', U: '유', V: '브이', W: '더블유', X: '엑스', Y: '와이', Z: '지' };
  var HANJA = { '人': '인', '民': '민', '軍': '군', '韓': '한', '中': '중', '日': '일', '美': '미' };
  var t = String(text || '');
  t = t.replace(/[人民軍韓中日美]/g, function (c) { return HANJA[c]; }).replace(/B2B/g, '비투비').replace(/B2G/g, '비투지');
  t = t.replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/(\d)([A-Za-z])/g, '$1 $2');
  // 영문 묶음 → 사전 또는 알파벳 읽기 (숫자 붙은 약어는 숫자를 떼어 따로 읽음)
  t = t.replace(/[A-Za-z][A-Za-z&]*(?:-[A-Za-z]+)*/g, function (w) {
    if (DICT[w]) return DICT[w];
    if (/^[A-Z&]+$/.test(w)) return w.split('').map(function (c) { return c === '&' ? '앤' : L[c]; }).join('');
    if (/^[A-Z][a-z]+$/.test(w) || /^[a-z]+$/.test(w)) return w;   // 일반 영어 단어는 그대로
    var parts = w.split('-'); if (parts.length > 1) return parts.map(function (p) { return DICT[p] || (/^[A-Z]+$/.test(p) ? p.split('').map(function (c) { return L[c]; }).join('') : p); }).join(' ');
    return w;
  });
  t = t.replace(/(\d),(?=\d{3}\b)/g, '$1');                                         // 1,000 → 1000
  t = t.replace(/(\d+)시(?:\s*(\d+)분)?/g, function (_, h, m) { return hour(h, m); });
  t = t.replace(/(\d+)월/g, function (_, m) { return (+m === 6 ? '유' : +m === 10 ? '시' : sino(m)) + '월'; });
  t = t.replace(/(\d+)\s*(건|개(?!국)|명|곳|가지|차례|시간)/g, function (_, n, u) { return (+n < 100 ? native(n) : sino(n)) + ' ' + u; });
  t = t.replace(/(\d+)\.(\d+)/g, function (_, a, b) { return sino(a) + '쩜' + b.split('').map(function (d) { return d === '0' ? '영' : D[d]; }).join(''); });
  t = t.replace(/%/g, '퍼센트');
  t = t.replace(/\d+/g, function (n) { return sino(n); });
  t = t.replace(/[()]/g, ', ').replace(/\s*-\s*/g, ' ').replace(/[·•]/g, ', ').replace(/\s+,/g, ',').replace(/,(\s*,)+/g, ',').replace(/,\s*\./g, '.').replace(/\s{2,}/g, ' ').trim().replace(/,$/, '.');
  return t;
}
