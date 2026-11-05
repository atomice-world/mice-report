// 리포트 조립·렌더·게시·메일 도우미.
//   eval(await fs.readFile('<skill>/scripts/build_report.js','utf8'));
//   const prev = await miceReport.loadPrev();                       // 전일 게시본(GitHub) 파싱
//   const data = miceReport.assemble({ g2b, web, prev, ed, now, members });
//   const out  = await miceReport.write(data, outDir);              // index.html, list.html, mail.html
//   await miceReport.publish(outDir, data);  await miceReport.email(outDir, data);   // 사용자 요청 시에만
globalThis.miceReport = (() => {
  const REPO = 'atomice-world/mice-report', SITE = 'https://atomice-world.github.io/mice-report/';
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#x27;');
  const unesc = s => String(s ?? '').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const kstParts = d => { const k = new Date(d.getTime() + 9 * 3600e3).toISOString(); return { ymd: k.slice(0, 10), md: k.slice(5, 10), hm: k.slice(11, 16), dow: DOW[new Date(k.slice(0, 10) + 'T00:00:00Z').getUTCDay()] }; };
  const g2bUrl = (no, ord) => `https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=${no}&bidPbancOrd=${ord}`;
  const normCo = s => String(s || '').replace(/주식회사|\(주\)|㈜|유한회사|\(유\)|협동조합|\s/g, '');

  const CSS = `body{font-family:'Malgun Gothic',Apple SD Gothic Neo,sans-serif;margin:0;background:#f4f6f9;color:#1f2733;}
.wrap{max-width:980px;margin:0 auto;background:#fff;}
.topbar{height:7px;background:#ffce6a;}
.header{background:#1a3a6b;color:#fff;padding:22px 28px;display:flex;justify-content:space-between;align-items:center;}
.header h1{font-size:24px;margin:0;}
.header .date{color:#ffd97a;font-weight:bold;}
h2{font-size:18px;border-left:5px solid #1a3a6b;padding-left:10px;margin-top:38px;}
table{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:8px;}
th,td{border:1px solid #e3e7ee;padding:7px 9px;text-align:left;}
th{background:#f0f3f8;}
.new{background:#e11d48;color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:bold;margin-left:5px;}
.mine{background:#0f766e;color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:bold;margin-left:5px;}
.rowwin{background:#fff8f2;}
.rowbid{background:#eefbf6;}
.summary{background:#fef9ef;border:1px solid #ffe2a8;padding:14px 18px;border-radius:6px;margin-top:14px;}
.note{font-size:12px;color:#667;margin-top:6px;}
a{color:#1a56db;text-decoration:none;}
.foot{padding:20px 28px;font-size:12px;color:#889;}
.today{background:#475569;color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:bold;margin-left:5px;}
.chg{background:#b45309;color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:bold;margin-left:5px;}`;

  // ---------- 전일 게시본 파싱 ----------
  async function loadPrev() {
    const get = async f => (await fetch(`https://raw.githubusercontent.com/${REPO}/main/${f}?v=${Date.now()}`)).text();
    const [index, list] = [await get('index.html'), await get('list.html')];
    const date = (list.match(/기준일 (\d{4}-\d\d-\d\d)/) || index.match(/기준일 (\d{4}-\d\d-\d\d)/) || [])[1];
    const sec = id => (list.match(new RegExp(`<h2 id='${id}'>[\\s\\S]*?(<table>[\\s\\S]*?<\\/table>)`)) || [])[1] || '';
    const rows = t => (t.match(/<tr[^>]*>(?!<th)[\s\S]*?<\/tr>/g) || []).filter(r => !r.includes('<th>'));
    const cells = r => [...r.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    const strip = s => unesc(String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    const bids = rows(sec('bid')).map(r => { const c = cells(r); const m = r.match(/bidPbancNo=([^&"]+)&(?:amp;)?bidPbancOrd=(\d+)/) || [];
      return { no: m[1], ord: m[2], name: strip((c[0] || '').replace(/<span[\s\S]*?<\/span>/g, '')), org: strip(c[1]), price: strip(c[2]), deadline: strip(c[3]).slice(0, 11) }; }).filter(b => b.no);
    const prespecs = rows(sec('spec')).map(r => { const c = cells(r); const no = (r.match(/R\d\dBD\d+/) || [])[0];
      return no ? { no, name: strip((c[0] || '').split('<br>')[0].replace(/<span[\s\S]*?<\/span>/g, '')), org: strip(c[1]), amount: strip(c[2]), deadline: strip(c[3]), flag: /class='today'>경계/.test(r) ? '경계' : '' } : null; }).filter(Boolean);
    const wins = rows(sec('win')).map(r => { const c = cells(r); const m = r.match(/bidPbancNo=([^&"]+)&(?:amp;)?bidPbancOrd=(\d+)/) || [];
      return { winner: strip((c[0] || '').replace(/<span[\s\S]*?<\/span>/g, '')), mine: /class='mine'/.test(r), name: strip(c[1]), org: strip(c[2]), amount: strip(c[3]), openDate: strip(c[4]), bidPbancNo: m[1], bidPbancOrd: m[2], url: m[1] ? g2bUrl(m[1], m[2]) : null }; });
    const calendar = rows(sec('cal')).map(r => { const c = cells(r).map(strip); return { period: c[0], field: c[1], name: c[2], region: c[3] }; });
    return { date, index, list, bids, prespecs, wins, calendar };
  }

  // ---------- 조립 ----------
  // ed(편집 입력): { summary(html), notices:[{title,href,date,isNew}], noticesNote, memberNews:[html], convention(text), news:[{title,url,press}],
  //   kmiceNews:[title], includeBids:[no], excludeBids:[no], includeSpecs:[no], excludeSpecs:[no], flags:{no:'경계'}, winsNote, extraWins:[win], dropWins:[no] }
  function assemble({ g2b, web, prev, ed = {}, now = new Date(), members = [] }) {
    const T = kstParts(now); const today = T.md;
    const prevCut = prev?.date ? new Date(prev.date + 'T00:00:00+09:00') : new Date(now.getTime() - 86400e3);
    const prevBid = new Map((prev?.bids || []).map(b => [b.no, b]));
    const inc = new Set(ed.includeBids || []), exc = new Set(ed.excludeBids || []);
    // 같은 공고명(재공고 등)은 최신 공고만
    const byName = new Map();
    for (const b of g2b.bids) { const k = b.name.replace(/\(재공고\)|재공고|\(긴급\)|\s/g, ''); const o = byName.get(k); if (!o || (b.postedISO || '') > (o.postedISO || '')) byName.set(k, b); }
    const latest = new Set([...byName.values()].map(b => b.bidPbancNo));
    let bids = []; const missed = [];
    for (const b of g2b.bids) {
      const p = prevBid.get(b.bidPbancNo); if (exc.has(b.bidPbancNo)) continue;
      const keep = inc.has(b.bidPbancNo) || p || (b.tier === 'core' && latest.has(b.bidPbancNo));
      if (!keep) continue;
      let deadline = b.deadline; if (!deadline) { if (p?.deadline && p.deadline >= today) deadline = p.deadline; else if (!inc.has(b.bidPbancNo)) continue; else deadline = '확인 필요'; }
      if (deadline !== '확인 필요' && deadline.slice(0, 5) < today) continue;
      const isNew = !p && b.postedISO && new Date(b.postedISO) >= prevCut;
      const changed = p && (p.ord !== b.bidPbancOrd || (b.deadline && p.deadline && p.deadline !== b.deadline));
      const row = { ...b, deadline, isNew, changed, oldDeadline: changed && p.deadline !== deadline ? p.deadline : '', today: deadline.slice(0, 5) === today };
      if (!p && !isNew) missed.push(row);
      bids.push(row);
    }
    // 전일 목록에 있었는데 G2B 결과에서 사라진 건(마감 전): 그대로 유지
    for (const p of prev?.bids || []) if (!bids.some(b => b.bidPbancNo === p.no) && !exc.has(p.no) && p.deadline >= today && !/확인/.test(p.deadline))
      bids.push({ name: p.name, org: p.org, prspPrce: p.price, deadline: p.deadline, bidPbancNo: p.no, bidPbancOrd: p.ord, url: g2bUrl(p.no, p.ord), carriedOnly: true, today: p.deadline.slice(0, 5) === today });
    bids.sort((a, b) => b.deadline.localeCompare(a.deadline));
    // 사전규격
    const prevSpec = new Map((prev?.prespecs || []).map(s => [s.no, s]));
    const sinc = new Set(ed.includeSpecs || []), sexc = new Set(ed.excludeSpecs || []);
    const prespecs = g2b.prespecs.filter(s => !sexc.has(s.bfSpecRegNo) && (sinc.has(s.bfSpecRegNo) || prevSpec.has(s.bfSpecRegNo) || s.tier === 'core'))
      .map(s => ({ ...s, isNew: !prevSpec.has(s.bfSpecRegNo) && (!s.publishedISO || new Date(s.publishedISO) >= prevCut), missed: !prevSpec.has(s.bfSpecRegNo) && s.publishedISO && new Date(s.publishedISO) < prevCut, flag: (ed.flags || {})[s.bfSpecRegNo] ?? prevSpec.get(s.bfSpecRegNo)?.flag ?? '', today: s.opinionDeadline.slice(0, 5) === today }));
    // 회원사 낙찰 (최근 45일)
    const cutoff = new Date(now.getTime() - 45 * 86400e3); const cutMD = kstParts(cutoff).md;
    const inWindow = md => { if (!md) return true; return cutMD <= today ? (md >= cutMD && md <= today) : (md >= cutMD || md <= today); };
    const mem = new Set(members.map(normCo)); const drop = new Set(ed.dropWins || []);
    let wins = (prev?.wins || []).filter(w => inWindow(w.openDate) && !drop.has(w.bidPbancNo));
    const have = new Set(wins.map(w => w.bidPbancNo));
    const newWins = [], otherWins = [];
    for (const w of g2b.wins) { if (have.has(w.bidPbancNo) || w.tier === 'event') continue;
      const isMem = mem.has(normCo(w.winner)); const row = { winner: w.winner.replace(/주식회사\s*|\(주\)|㈜/g, '').trim(), mine: /아토마이스/.test(w.winner), name: w.name, org: w.org, amount: w.amount, openDate: w.openDate, bidPbancNo: w.bidPbancNo, bidPbancOrd: w.bidPbancOrd, url: w.url, isNew: true };
      (isMem ? newWins : otherWins).push(row); }
    wins = [...newWins, ...(ed.extraWins || []), ...wins].sort((a, b) => (b.mine - a.mine) || (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
    // 캘린더
    const regionOf = new Map((prev?.calendar || []).map(c => [c.name, c.region]));
    const calendar = (web?.kmice?.calendar?.length ? web.kmice.calendar.map(c => ({ period: `${c.start}~${c.end}`, field: c.field, name: c.name, region: (c.region && c.region !== '-') ? c.region : (regionOf.get(c.name) || '-'), start: c.start, end: c.end }))
      : (prev?.calendar || []).map(c => ({ ...c, start: c.period.slice(0, 5), end: c.period.slice(6, 11) }))).filter(c => c.end >= today).map(c => ({ ...c, ongoing: c.start <= today && c.end >= today }));
    return { date: T.ymd, md: T.md, dow: T.dow, today, now: now.toISOString(), prevDate: prev?.date, bids, missed, prespecs, wins, newWins, otherWins, calendar, ed,
      counts: { bids: bids.length, newBids: bids.filter(b => b.isNew).length, todayBids: bids.filter(b => b.today).length, changed: bids.filter(b => b.changed).length, specs: prespecs.length, newSpecs: prespecs.filter(s => s.isNew).length, wins: wins.length, newWins: newWins.length } };
  }

  // ---------- 렌더 ----------
  const badge = (cls, t) => ` <span class='${cls}'>${t}</span>`;
  function bidRow(b) {
    return `<tr${b.isNew ? " class='rowbid'" : ''}><td><a href="${b.url || g2bUrl(b.bidPbancNo, b.bidPbancOrd)}" target="_blank">${esc(b.name)}</a>${b.isNew ? badge('new', 'NEW') : ''}${b.changed ? badge('chg', '변경공고') : ''}${b.today ? badge('today', '오늘 마감') : ''}</td><td>${esc(b.org)}</td><td>${esc(b.prspPrce)}</td><td>${esc(b.deadline)}${b.oldDeadline ? ` (${esc(b.oldDeadline.slice(0, 5))}→)` : ''}</td></tr>`;
  }
  const bidTable = rows => `<table><tr><th>공고명</th><th>발주기관</th><th>추정가격</th><th>입찰마감</th></tr>${rows.map(bidRow).join('')}</table>`;
  const specTable = rows => rows.length ? `<table><tr><th>사전규격명</th><th>발주기관</th><th>배정예산</th><th>의견마감</th></tr>${rows.map(s => `<tr${s.isNew ? " class='rowbid'" : ''}><td>${esc(s.name)}${s.isNew ? badge('new', 'NEW') : ''}${s.flag ? badge('today', esc(s.flag)) : ''}${s.today ? badge('today', '오늘 마감') : ''}<br><span class='note'>사전규격번호 ${s.bfSpecRegNo} · 공개 ${esc(s.published)}</span></td><td>${esc(s.org)}</td><td>${esc(s.amount)}</td><td>${esc(s.opinionDeadline)}</td></tr>`).join('')}</table>` : `<p style='font-size:13.5px;'>조건을 충족하는 사전규격이 없습니다 (0건).</p>`;
  const winTable = (rows, idx) => `<table><tr><th>수주사</th><th>용역명</th><th>발주기관</th><th>낙찰금액</th><th>개찰일(예정)</th></tr>${rows.map((w, i) => `<tr${idx && (w.mine || w.isNew) ? " class='rowwin'" : ''}><td>${esc(w.winner)}${w.mine ? badge('mine', '자사') : ''}${w.isNew ? badge('new', 'NEW') : ''}</td><td>${w.url ? `<a href="${w.url}" target="_blank">${esc(w.name)}</a>` : esc(w.name)}</td><td>${esc(w.org)}</td><td>${esc(w.amount)}</td><td>${esc(w.openDate)}</td></tr>`).join('')}</table>`;
  const calTable = rows => `<table><tr><th>기간</th><th>분야</th><th>행사명</th><th>지역</th></tr>${rows.map(c => `<tr${c.ongoing ? " style='background:#fff8f2;'" : ''}><td>${esc(c.period)}</td><td>${esc(c.field)}</td><td>${esc(c.name)}</td><td>${esc(c.region)}</td></tr>`).join('')}</table>`;
  const page = (title, right, body, foot) => `<!doctype html><html lang='ko'><head><meta charset='utf-8'><title>${title}</title>\n<style>\n${CSS}\n</style>\n</head><body><div class='wrap'><div class='topbar'></div><div class='header'><h1>${title}</h1><div class='date'>${right}</div></div><div style='padding:10px 28px 30px;'>${body}</div><div class='foot'>${foot}</div></div></body></html>`;

  function render(d) {
    const ed = d.ed, m = +d.md.slice(0, 2), day = +d.md.slice(3, 5), title = `${m}월 ${day}일 MICE 및 PCO업계 소식 리포트`;
    const top6 = [...d.bids.filter(b => b.isNew && !b.today), ...d.bids.filter(b => !b.isNew)].slice(0, 6);
    const li = (h, t, extra = '') => `<li>${h ? `<a href='${esc(h)}' target='_blank'>${esc(t)}</a>` : esc(t)}${extra}</li>`;
    const body = `<div class='summary'>${ed.summary || ''}</div>`
      + `<h2>② 협회 공지 (KAPCO·KMA)</h2><ul>${(ed.notices || []).map(n => li(n.href, n.title, `${n.isNew ? badge('new', 'NEW') : ''}${n.date ? ` — ${esc(n.date)}` : ''}`)).join('')}</ul>${ed.noticesNote ? `<p class='note'>${ed.noticesNote}</p>` : ''}`
      + `<h2>③ 회원사 소식</h2><ul>${(ed.memberNews || []).map(h => `<li>${h}</li>`).join('')}</ul>`
      + `<h2>④ 컨벤션센터</h2><p style='font-size:13.5px;'>${esc(ed.convention || '')}</p>`
      + `<h2>⑤ 뉴스 클리핑</h2><ul>${(ed.news || []).map(n => li(n.url, n.title, n.press ? ` (${esc(n.press)})` : '')).join('')}</ul>`
      + `<h2>⑥ K-MICE 소식</h2><ul>${(ed.kmiceNews || []).map(t => li('https://k-mice.visitkorea.or.kr/main.kto?func_name=mainStart', t)).join('')}</ul>`
      + `<h3 style='font-size:14.5px;margin-top:18px;'>📅 ${m}월 MICE 캘린더 (주요 일정)</h3>${calTable(d.calendar.slice(0, 20))}<p class='note'>전체 ${d.calendar.length}건 중 상위 20건(음영: 오늘 진행 중). 전체 목록은 <a href='list.html#cal' target='_blank'>list.html</a> 참조.</p>`
      + `<h2>⑦ 회원사 낙찰현황 (최근 45일)</h2>${winTable(d.wins, true)}<p class='note'>※ 협상에 의한 계약은 낙찰금액이 비공개여서 배정예산과 사업금액(추정가격+부가세) 중 더 큰 금액으로 표시합니다. 예정개찰일과 실제개찰일이 다를 수 있습니다. ${ed.winsNote || ''}</p>`
      + `<h2>⑧ 3억 이하 검토 필요 용역 사전규격</h2>${specTable(d.prespecs)}<p class='note'>${ed.specNote || ''} <a href='list.html#spec' target='_blank'>전체 보기 →</a></p>`
      + `<h2>⑨ 3억 이하 검토 필요 입찰정보</h2>${bidTable(top6)}<p class='note'>전체 ${d.bids.length}건 중 신규·마감 먼 순 상위 6건. <a href='list.html#bid' target='_blank'>전체 ${d.bids.length}건 보기 →</a></p>`;
    const index = page(title, `${d.dow}요일 · 기준일 ${d.date}`, body, '㈜아토마이스 재경 — MICE·PCO 업계 일일 리포트 · 자동 생성');
    const list = page('MICE·PCO 전체 리스트', `기준일 ${d.date}`, `<p><a href='index.html'>← 데일리 브리프로</a></p><h2 id='spec'>⑧ 사전규격 (전체)</h2>${specTable(d.prespecs)}<h2 id='bid'>⑨ 입찰정보 (전체, 마감 먼 순)</h2>${bidTable(d.bids)}<h2 id='cal'>📅 ${m}월 MICE 캘린더 (전체)</h2>${calTable(d.calendar)}<h2 id='win'>⑦ 회원사 낙찰현황 (전체)</h2>${winTable(d.wins, false)}`, '㈜아토마이스 재경 — MICE·PCO 업계 일일 리포트 전체 리스트').replace("<title>MICE·PCO 전체 리스트</title>", "<title>MICE·PCO 전체 리스트</title>");
    return { index, list, mail: renderMail(d, title), subject: `MICE·PCO 데일리 브리프 — ${m}월 ${day}일 (${d.dow}요일)` };
  }

  function renderMail(d, title) {
    const ed = d.ed;
    const td = s => `<td style="border:1px solid #e3e7ee;padding:6px 8px;font-size:12.5px">${s}</td>`;
    const th = s => `<th style="border:1px solid #e3e7ee;padding:6px 8px;font-size:12.5px;background-color:#f0f3f8;text-align:left">${s}</th>`;
    const a = (u, t) => `<a href="${esc(u)}" style="color:#1a56db" target="_blank">${t}</a>`;
    const h3 = (t, mt = 22) => `<h3 style="border-left:5px solid #1a3a6b;padding-left:9px;font-size:15px;margin-top:${mt}px">${t}</h3>`;
    const tbl = (hs, rows) => `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tbody><tr>${hs.map(th).join('')}</tr>${rows.join('')}</tbody></table>`;
    const B = (bg, t) => ` <span style="background-color:${bg};color:#ffffff;border-radius:4px;padding:1px 5px;font-size:10.5px;font-weight:bold">${t}</span>`;
    const hl = 'style="background-color:#eefbf6"';
    const newBids = d.bids.filter(b => b.isNew || b.changed);
    return `<div style="max-width:640px;margin:0 auto;font-family:'Malgun Gothic',sans-serif;color:#1f2733">
<table width="100%" cellpadding="0" cellspacing="0"><tbody><tr><td bgcolor="#ffce6a" style="background-color:#ffce6a;height:7px;font-size:1px;line-height:1px">&nbsp;</td></tr></tbody></table>
<table width="100%" cellpadding="0" cellspacing="0"><tbody><tr><td bgcolor="#1a3a6b" style="background-color:#1a3a6b;padding:22px 26px"><span style="color:#ffffff;font-size:24px;font-weight:bold">${title}</span><br><span style="color:#ffd97a;font-weight:bold;font-size:13px">${d.dow}요일 · 기준일 ${d.date}</span></td></tr></tbody></table>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px"><tbody><tr>
<td style="padding-right:6px"><a href="${SITE}" style="display:block;background-color:#1a3a6b;color:#ffffff;text-align:center;padding:12px 0;border-radius:5px;font-size:13.5px;text-decoration:none" target="_blank">📄 전체 리포트 보기 →</a></td>
<td style="padding-left:6px"><a href="${SITE}list.html" style="display:block;background-color:#0f766e;color:#ffffff;text-align:center;padding:12px 0;border-radius:5px;font-size:13.5px;text-decoration:none" target="_blank">📋 입찰·사전규격 전체 리스트 →</a></td>
</tr></tbody></table>
<div style="background-color:#fef9ef;border:1px solid #ffe2a8;border-radius:6px;padding:14px 18px;margin-top:18px;font-size:13.5px">${ed.summary || ''}</div>
${h3('② 협회 공지', 26)}<ul style="font-size:13px;padding-left:18px">${(ed.notices || []).map(n => `<li>${n.href ? a(n.href, esc(n.title)) : esc(n.title)}${n.isNew ? ` (NEW${n.date ? ', ' + esc(n.date.slice(5).replace('-', '/')) : ''})` : ''}</li>`).join('')}</ul>
${h3('⑤ 뉴스 클리핑')}<ul style="font-size:13px;padding-left:18px">${(ed.news || []).map(n => `<li>${a(n.url, esc(n.title))}${n.press ? ` (${esc(n.press)})` : ''}</li>`).join('')}</ul>
${h3('📅 MICE 캘린더 (주요 일정)')}${tbl(['기간', '분야', '행사명', '지역'], d.calendar.slice(0, 15).map(c => `<tr${c.ongoing ? ' style="background-color:#fff8f2"' : ''}>${[c.period, c.field, esc(c.name), c.region].map(td).join('')}</tr>`))}<p style="font-size:11px;color:#667">음영: 오늘 진행 중</p>
${h3('⑦ 회원사 낙찰현황 (주요)')}${tbl(['수주사', '용역명', '발주기관', '낙찰금액'], d.wins.slice(0, 6).map(w => `<tr>${td(esc(w.winner) + (w.mine ? B('#0f766e', '자사') : '') + (w.isNew ? B('#e11d48', 'NEW') : ''))}${td(w.url ? a(w.url, esc(w.name)) : esc(w.name))}${td(esc(w.org))}${td(esc(w.amount))}</tr>`))}
<p style="font-size:11px;color:#667">※ 협상에 의한 계약은 낙찰금액이 비공개여서 배정예산과 사업금액(추정가격+부가세) 중 더 큰 금액으로 표시합니다. ${ed.winsNote || ''}</p>
${h3(`⑧ 3억 이하 사전규격 (${d.counts.specs}건, 신규 ${d.counts.newSpecs}건)`)}${d.prespecs.length ? tbl(['사전규격명', '발주기관', '배정예산', '의견마감'], d.prespecs.map(s => `<tr${s.isNew ? ' ' + hl : ''}>${td(esc(s.name) + (s.isNew ? B('#e11d48', 'NEW') : '') + (s.flag ? B('#475569', esc(s.flag)) : ''))}${td(esc(s.org))}${td(esc(s.amount.replace(', VAT포함', '')))}${td(esc(s.opinionDeadline))}</tr>`)) : '<p style="font-size:13px">조건을 충족하는 건 없음 (0건)</p>'}
${h3(`⑨ 3억 이하 입찰정보 (신규 ${d.counts.newBids}건${d.counts.changed ? `, 변경 ${d.counts.changed}건` : ''})`)}${newBids.length ? tbl(['공고명', '발주기관', '추정가격', '입찰마감'], newBids.map(b => `<tr${b.isNew ? ' ' + hl : ''}>${td(a(b.url || g2bUrl(b.bidPbancNo, b.bidPbancOrd), esc(b.name)) + (b.isNew ? B('#e11d48', 'NEW') : '') + (b.changed ? B('#b45309', '변경공고') : ''))}${td(esc(b.org))}${td(esc(b.prspPrce))}${td(esc(b.deadline) + (b.today ? ' (오늘)' : '') + (b.oldDeadline ? ` (${esc(b.oldDeadline.slice(0, 5))}→)` : ''))}</tr>`)) : '<p style="font-size:13px">신규 공고 없음</p>'}
<p style="font-size:13.5px">⑨ 입찰정보: 전체 ${d.bids.length}건 — ${a(SITE + 'list.html#bid', '전체 보기 →')}</p>
<p style="font-size:11px;color:#889;margin-top:28px">㈜아토마이스 재경 · MICE·PCO 업계 일일 리포트 자동 생성</p></div>`;
  }

  async function write(d, outDir) {
    const r = render(d); await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'index.html'), r.index); await fs.writeFile(path.join(outDir, 'list.html'), r.list);
    await fs.writeFile(path.join(outDir, 'mail.html'), r.mail); await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify({ ...d, rendered: undefined }, null, 1));
    return { ...r, outDir };
  }

  // ---------- 게시 (GitHub 업로드 페이지) ----------
  async function publish(outDir, d) {
    const gh = await openTab(`https://github.com/${REPO}/upload/main`);
    try {
      await gh.locator('input[type=file]').first().setInputFiles([path.join(outDir, 'index.html'), path.join(outDir, 'list.html')]);
      await sleep(4000);
      await gh.locator('#commit-summary-input, input[name="commit_title"], [placeholder="Add files via upload"]').first().fill(`MICE·PCO 데일리 리포트 ${d.date}`);
      await gh.locator('button:has-text("Commit changes")').first().click();
      await sleep(4000);
    } finally { await closeTab(gh).catch(() => {}); }
    const c = await (await fetch(`https://api.github.com/repos/${REPO}/commits?per_page=1`)).json();
    let live = false; for (let i = 0; i < 9 && !live; i++) { const t = await (await fetch(SITE + '?v=' + Date.now())).text(); live = t.includes(`기준일 ${d.date}`); if (!live) await sleep(10000); }
    return { sha: c[0]?.sha?.slice(0, 7), message: c[0]?.commit?.message, live };
  }

  // ---------- 메일 (Gmail uid 0: momoact@gmail.com → mice@atomice.co.kr) ----------
  async function email(outDir, d, opts = {}) {
    const html = await fs.readFile(path.join(outDir, 'mail.html'), 'utf8'); const subject = render(d).subject;
    const cp = await gmail.openComposer(opts.uid ?? 0, { to: opts.to || 'mice@atomice.co.kr', subject, bodyHtml: html });
    await sleep(2000);
    const body = await cp.locator('[role=textbox][aria-label]').innerText();
    if (!body.trim()) throw new Error('메일 본문이 비어 있어 발송 중단');
    await cp.locator('[data-tooltip*="Send"], [data-tooltip*="보내기"]').first().click();
    await sleep(4000);
    const s = await gmail.search(opts.uid ?? 0, `in:sent subject:"${subject}"`);
    return { subject, sent: s.results.length > 0, at: s.results[0]?.timestamp };
  }

  // 공식 API(a) + 내부 API(b) 결과 합치기: 공식 API 우선, 내부에만 있는 건(민간공고 등) 추가
  function mergeG2B(a, b) {
    if (!a) return b; if (!b) return a;
    const u = (x, y, k) => { const m = new Map(x.map(r => [k(r), r])); for (const r of y) if (!m.has(k(r))) m.set(k(r), r); return [...m.values()]; };
    return { ...a, source: `${a.source || 'api'}+internal`, bids: u(a.bids, b.bids, r => r.bidPbancNo).sort((p, q) => (q.deadline || '99').localeCompare(p.deadline || '99')),
      prespecs: u(a.prespecs, b.prespecs, r => r.bfSpecRegNo), wins: u(a.wins, b.wins, r => r.bidPbancNo + '-' + r.bidPbancOrd), stats: { api: a.stats, internal: b.stats } };
  }

  return { loadPrev, assemble, render, write, publish, email, mergeG2B, kstParts, SITE, REPO };
})();
