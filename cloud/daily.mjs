// GitHub Actions 대체 실행: PC(Aside)가 오늘 리포트를 게시하지 않았을 때 서버에서 간이 리포트를 만든다.
// MODE: auto(오늘 게시본 있으면 건너뜀) | force(무조건 생성·게시) | test(생성만, 커밋 안 함, 테스트 수신자에게 메일)
import fsp from 'node:fs/promises';
import pth from 'node:path';
import { createRequire } from 'node:module';
globalThis.fs = fsp; globalThis.path = pth; globalThis.sleep = ms => new Promise(r => setTimeout(r, ms));
const require = createRequire(import.meta.url);
require('./lib/g2b_api.js');
require('./lib/build_report.js');
const { miceG2BApi, miceReport } = globalThis;

const MODE = process.env.MODE || 'auto';
const OUT = process.env.OUT_DIR || 'cloud_out';
const now = new Date();
const T = miceReport.kstParts(now);
const setOut = async (k, v) => { if (process.env.GITHUB_OUTPUT) await fsp.appendFile(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); console.log(`[out] ${k}=${v}`); };

const cur = await fsp.readFile('index.html', 'utf8').catch(() => '');
if (MODE === 'auto' && cur.includes(`기준일 ${T.ymd}`)) { console.log('오늘 리포트가 이미 게시되어 있음 → 건너뜀'); await setOut('skip', 'true'); process.exit(0); }
await setOut('skip', 'false');

const notes = [];
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const get = async (u, ms = 20000) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36', 'Accept-Language': 'ko-KR,ko;q=0.9' } }); return await r.text(); } finally { clearTimeout(t); } };

// ---------- 전일 게시본 ----------
const prev = await miceReport.loadPrev();

// ---------- 나라장터 (공식 OpenAPI) ----------
let g2b = null;
try { g2b = await miceG2BApi.collect({ now }); console.log('G2B', g2b.stats); if (g2b.stats.errors?.length && !g2b.bids.length) throw new Error(g2b.stats.errors[0]); }
catch (e) { notes.push(`나라장터 API 조회 실패(${e.message}) — ⑦⑧⑨는 전일 목록 기준`); g2b = null; }
if (!g2b) g2b = { bids: [], wins: [], prespecs: (prev.prespecs || []).filter(s => (s.deadline || '') >= T.md).map(s => ({ name: s.name, org: s.org, amount: s.amount, opinionDeadline: s.deadline, bfSpecRegNo: s.no, published: '', tier: 'core' })) };

// ---------- K-MICE (소식·캘린더) ----------
const web = { kmice: { news: [], calendar: [] } };
try {
  // 캘린더 목록 페이지는 서버 렌더링(페이지당 10건, 지역 포함). 메인의 'MICE 소식'은 JS 렌더링이라 전일분 승계.
  for (let p = 1; p <= 8; p++) {
    const h = await get(`https://k-mice.visitkorea.or.kr/miceCalendar.kto?func_name=list&curr_page=${p}`);
    const rows = [...h.matchAll(/<span class="cate-txt">([^<]*)<\/span>[\s\S]*?<p class="kor tit">([^<]*)<\/p>[\s\S]*?<span class="date">(\d{4})-(\d\d)-(\d\d) ~ (\d{4})-(\d\d)-(\d\d)<\/span>\s*<span class="region">([^<]*)<\/span>/g)]
      .map(m => ({ field: strip(m[1]), name: strip(m[2]), start: `${m[4]}-${m[5]}`, end: `${m[7]}-${m[8]}`, region: strip(m[9]) || '-' }));
    if (!rows.length) break; web.kmice.calendar.push(...rows); if (rows.length < 10) break;
  }
  if (!web.kmice.calendar.length) notes.push('K-MICE 캘린더 파싱 실패 — 전일 캘린더 사용');
} catch (e) { notes.push(`K-MICE 접속 실패(${e.message}) — 전일 캘린더 사용`); }

// ---------- 뉴스 (Google 뉴스 RSS) ----------
const news = [];
try {
  const seen = new Set(); const MICE = /MICE|마이스|PCO|컨벤션|국제회의|전시회|박람회|엑스포|포럼|컨퍼런스|콘퍼런스/;
  for (const q of ['마이스 MICE', 'PCO 컨벤션', '국제회의 유치', '컨벤션센터']) {
    const xml = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:1d')}&hl=ko&gl=KR&ceid=KR:ko`);
    for (const it of xml.split('<item>').slice(1)) {
      const title = strip((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace(/<!\[CDATA\[|\]\]>/g, ''));
      const link = strip((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
      const press = strip((it.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1]);
      const t = title.replace(new RegExp(`\\s*-\\s*${press.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '');
      const key = t.replace(/[^가-힣A-Za-z0-9]/g, '').slice(0, 14);
      if (!t || !MICE.test(t) || seen.has(key)) continue; seen.add(key); news.push({ title: t, url: link, press });
    }
    if (news.length >= 8) break;
  }
} catch (e) { notes.push(`뉴스 수집 실패(${e.message})`); }

// ---------- 협회 공지: 전일 게시본 승계 ----------
const prevSec = (h2) => (prev.index.match(new RegExp(`<h2>${h2}[\\s\\S]*?<ul>([\\s\\S]*?)<\\/ul>`)) || [])[1] || '';
const notices = [...prevSec('② 협회 공지').matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => { const a = m[1].match(/<a href='([^']+)'[^>]*>([\s\S]*?)<\/a>/); const date = (m[1].match(/— (\d{4}-\d\d-\d\d)/) || [])[1] || '';
  return { title: strip(a ? a[2] : m[1].replace(/<span[\s\S]*?<\/span>/g, '').replace(/— \d{4}-\d\d-\d\d/, '')), href: a ? a[1].replace(/&amp;/g, '&') : null, date }; }).filter(n => n.title);
const kmiceNews = web.kmice.news.length ? web.kmice.news : [...prevSec('⑥ K-MICE 소식').matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => strip(m[1]));
const members = JSON.parse(await fsp.readFile(new URL('./kapco_members.json', import.meta.url), 'utf8')).members;

// ---------- 조립 ----------
const ed = { notices, noticesNote: '※ 서버 자동 생성본으로, 협회 공지는 전일 리포트 기준입니다.', kmiceNews, news: news.slice(0, 7),
  memberNews: ["※ 오늘은 사내 PC가 꺼져 있어 서버에서 간이 리포트로 자동 생성했습니다. 회원사·업계 동향은 다음 정규 리포트에서 보완합니다."],
  winsNote: '', specNote: '' };
let d = miceReport.assemble({ g2b, web: web.kmice.calendar.length ? web : null, prev, ed, now, members });
const ongoing = d.calendar.filter(c => c.ongoing).slice(0, 6).map(c => `${c.name}(${c.region !== '-' ? c.region + ', ' : ''}~${c.end.replace('-', '.')}.)`);
ed.convention = ongoing.length ? `K-MICE 캘린더 기준 오늘(${+T.md.slice(0, 2)}.${+T.md.slice(3)}.) 진행 중인 주요 행사: ${ongoing.join(', ')}.` : 'K-MICE 캘린더 기준 오늘 진행 중인 주요 국제회의는 없습니다.';
if (d.newWins.length) ed.winsNote = `신규 회원사 낙찰 ${d.newWins.length}건.`;
else ed.winsNote = `최근 개찰분 중 회원사 신규 낙찰은 확인되지 않았습니다.${d.otherWins.length ? ` 참고: ${d.otherWins.filter(w => w.openDate >= (prev.date || '').slice(5)).slice(0, 2).map(w => `「${w.name}」 ${w.winner} ${w.amount.replace(/ \(.*\)/, '')}`).join(', ')}` : ''}`.replace(/ 참고: $/, '');
const newB = d.bids.filter(b => b.isNew).slice(0, 3).map(b => `「${b.name}」`).join(', ');
const newS = d.prespecs.filter(s => s.isNew).slice(0, 2).map(s => s.name).join(', ');
const c = d.counts;
ed.summary = `<b style='color:#e11d48;'>자동 생성 안내:</b> 오늘은 사내 PC가 꺼져 있어 서버(GitHub Actions)에서 리포트를 자동 생성했습니다. 뉴스는 자동 선별, 협회 공지는 전일 기준입니다.${notes.length ? ' (' + notes.join(' / ') + ')' : ''}<br><br>`
  + `⑨ 3억 이하 검토 필요 입찰정보 ${c.bids}건(신규 ${c.newBids}건${newB ? ': ' + newB : ''}${c.todayBids ? `, 오늘 마감 ${c.todayBids}건` : ''}), ⑧ 사전규격 ${c.specs}건(신규 ${c.newSpecs}건${newS ? ': ' + newS : ''}), ⑦ 회원사 낙찰현황 ${c.wins}건(신규 ${c.newWins}건)입니다.`;
d = miceReport.assemble({ g2b, web: web.kmice.calendar.length ? web : null, prev, ed, now, members });

// ---------- 출력 ----------
const r = miceReport.render(d);
await fsp.mkdir(OUT, { recursive: true });
await fsp.writeFile(pth.join(OUT, 'mail.html'), r.mail);
await fsp.writeFile(pth.join(OUT, 'subject.txt'), (MODE === 'test' ? '[테스트] ' : '') + r.subject);
await fsp.writeFile(pth.join(OUT, 'index.html'), r.index);
await fsp.writeFile(pth.join(OUT, 'list.html'), r.list);
if (MODE !== 'test') { await fsp.writeFile('index.html', r.index); await fsp.writeFile('list.html', r.list); }
console.log('완료', T.ymd, JSON.stringify(c), notes);
await setOut('date', T.ymd);
