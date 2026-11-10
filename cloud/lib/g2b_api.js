// 나라장터 수집기 (공공데이터포털 공식 OpenAPI 버전, 브라우저 탭 불필요).
//   eval(await fs.readFile('<skill>/scripts/g2b_api.js','utf8'));
//   const g2b = await miceG2BApi.collect({ now: new Date() });
// 반환 형식은 g2b_collect.js(miceG2B.collect)와 동일: { bids, prespecs, wins, stats }
// 인증키: <skill>/.secrets/datagokr_service_key.txt (Aside Vault "공공데이터포털 - 조달청 나라장터 API 인증키"에도 백업)
// 개발계정 한도: 상세기능별 1일 1,000회. 한 번 실행에 약 80~100회 사용.
globalThis.miceG2BApi = (() => {
  const SKILL = 'C:\\Users\\USER\\.aside\\u\\0\\skills\\user\\mice-pco-daily-report';
  const BID = 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService02';
  const SPEC = 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService';
  const WIN = 'https://apis.data.go.kr/1230000/as/ScsbidInfoService';
  const KWS = ['포럼','컨퍼런스','콘퍼런스','세미나','심포지엄','학술대회','국제회의','박람회','설명회','상담회','총회','워크숍','워크샵','컨벤션','엑스포','성과보고회','학회','국제행사','행사 대행','행사대행','행사 운영','행사운영'];
  const CORE_KW = ['포럼','컨퍼런스','콘퍼런스','세미나','심포지엄','학술대회','국제회의','학회','총회','상담회','설명회','성과보고회','성과공유회','컨벤션','엑스포','박람회','워크숍','워크샵','국제행사'];
  const BORDER = ['축제','페스티벌','페스타','졸업식','입학식','학위수여식','시상식','기념식','신년인사회','입학박람회','채용박람회','채용 박람회','취업박람회','잡 페어','잡페어','직무박람회','일자리','교육과정','연수','훈련','설치','제작','임대','임차','시스템','플랫폼','웹사이트','유지보수','구축','측량','공사','설계','타당성','기본계획','영상','홍보물','홍보관','전시관','기념품','캠프','경진대회','해커톤','공연','조성','콘텐츠','신입직원','참관','장터','마켓','부스'];
  const tierOf = name => !CORE_KW.some(w => name.includes(w)) ? 'event' : (BORDER.some(w => name.includes(w)) ? 'border' : 'core');
  const won = n => (n === null || n === undefined || n === '' || isNaN(Number(n)) || Number(n) === 0) ? '' : Number(n).toLocaleString('ko-KR') + '원';
  const kst = s => { const m = String(s || '').match(/(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/); return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`) : null; };
  const mmdd = d => { if (!d) return ''; const k = new Date(d.getTime() + 9 * 3600e3).toISOString(); return `${k.slice(5, 7)}-${k.slice(8, 10)} ${k.slice(11, 16)}`; };
  const stamp = (d, end) => { const k = new Date(d.getTime() + 9 * 3600e3).toISOString(); return k.slice(0, 10).replace(/-/g, '') + (end ? '2359' : '0000'); };
  const addDays = (d, n) => new Date(d.getTime() + n * 86400e3);
  const link = (no, ord) => `https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=${no}&bidPbancOrd=${ord}`;
  let KEY = null, CALLS = 0;
  async function key() {
    if (!KEY && typeof process !== 'undefined' && process.env && process.env.DATA_GO_KR_KEY) KEY = process.env.DATA_GO_KR_KEY.trim();   // GitHub Actions
    if (!KEY) KEY = (await fs.readFile(SKILL + '\\.secrets\\datagokr_service_key.txt', 'utf8')).trim();
    return KEY; }
  async function call(url, params) {
    const q = new URLSearchParams({ ServiceKey: await key(), type: 'json', pageNo: '1', numOfRows: '999', ...params });
    for (let t = 0; t < 3; t++) {
      CALLS++;
      try { const r = await fetch(url + '?' + q); const txt = await r.text(); const j = JSON.parse(txt);
        const h = j.response?.header || j['nkoneps.com.response.ResponseError']?.header || {};
        if (h.resultCode && h.resultCode !== '00') throw new Error(`${h.resultCode} ${h.resultMsg}`);
        const items = j.response?.body?.items; return { items: Array.isArray(items) ? items : (items?.item ? [].concat(items.item) : []), total: +(j.response?.body?.totalCount || 0) };
      } catch (e) { if (t === 2 || /^(07|10|12|20|22|30|31|32)\b/.test(e.message)) throw e; await sleep(800); }
    }
  }
  async function pool(tasks, conc = 6) { const out = new Array(tasks.length); let i = 0; const errs = [];
    await Promise.all(Array.from({ length: conc }, async () => { while (i < tasks.length) { const k = i++; try { out[k] = await tasks[k](); } catch (e) { errs.push(e.message); out[k] = null; } } }));
    return { out, errs }; }
  // 조회기간 제한(2026-11-11부터 7일 초과 시 07 에러) → 6일 구간 분할
  const windows = (now, days, span = 6) => { const w = []; for (let s = days; s > 0; s -= span) w.push([addDays(now, -s), addDays(now, -Math.max(0, s - span))]); return w; };

  async function collect(opts = {}) {
    const now = opts.now || new Date(); CALLS = 0;
    const maxPrice = opts.maxPrice || 300000000, maxBudget = Math.round(maxPrice * 1.1);
    const stats = {}; const errors = [];
    // ---------- 입찰공고 (용역) ----------
    const tasks = []; for (const kw of KWS) for (const [a, b] of windows(now, opts.bidDays || 56))
      tasks.push(async () => ({ kw, ...(await call(BID + '/getBidPblancListInfoServcPPSSrch02', { inqryDiv: '1', inqryBgnDt: stamp(a), inqryEndDt: stamp(b, true), bidNtceNm: kw })) }));
    let r = await pool(tasks); errors.push(...r.errs);
    const map = new Map();
    for (const res of r.out) for (const x of res?.items || []) { const p = map.get(x.bidNtceNo); if (!p || x.bidNtceOrd > p.bidNtceOrd) map.set(x.bidNtceNo, { ...x, _kw: res.kw }); }
    stats.bidRaw = map.size;
    const bids = [];
    for (const x of map.values()) {
      if (/취소/.test(x.ntceKindNm || '')) continue;
      const dl = kst(x.bidClseDt), posted = kst(x.bidNtceDt);
      if (dl && dl <= now) continue; if (!dl && posted && posted < addDays(now, -30)) continue;
      const prsp = Number(x.presmptPrce) || 0, alot = Number(x.asignBdgtAmt) || 0;
      if (prsp ? prsp > maxPrice : (alot ? alot > maxBudget : true)) continue;
      const name = String(x.bidNtceNm || '').trim(), oder = x.ntceInsttNm || '', dmst = x.dminsttNm || '';
      let tier = tierOf(name); if (tier === 'event' && /국제행사|회의/.test(x.pubPrcrmntClsfcNm || '')) tier = 'core';
      bids.push({ name, org: dmst && dmst !== oder ? `${oder}·${dmst}` : oder, prspPrce: prsp ? won(prsp) : `${won(alot)} (배정예산, 추정가격 미표기)`, prsp, alot,
        deadline: dl ? mmdd(dl) : '', deadlineISO: dl?.toISOString() || null, postedISO: posted?.toISOString() || null, posted: mmdd(posted),
        bidPbancNo: x.bidNtceNo, bidPbancOrd: x.bidNtceOrd, url: link(x.bidNtceNo, x.bidNtceOrd), status: x.ntceKindNm, method: String(x.sucsfbidMthdNm || x.cntrctCnclsMthdNm || '').split('-')[0],
        kind: x.srvceDivNm || '용역', category: x.pubPrcrmntClsfcNm || '', kw: x._kw, tier });
    }
    bids.sort((a, b) => (b.deadline || '99').localeCompare(a.deadline || '99'));
    // ---------- 사전규격 (용역) ----------
    r = await pool(KWS.map(kw => async () => ({ kw, ...(await call(SPEC + '/getPublicPrcureThngInfoServcPPSSrch', { inqryDiv: '1', inqryBgnDt: stamp(addDays(now, -(opts.prespecDays || 10))), inqryEndDt: stamp(now, true), prdctClsfcNoNm: kw })) })));
    errors.push(...r.errs);
    const smap = new Map(); for (const res of r.out) for (const x of res?.items || []) if (!smap.has(x.bfSpecRgstNo)) smap.set(x.bfSpecRgstNo, { ...x, _kw: res.kw });
    stats.prespecRaw = smap.size;
    const prespecs = [];
    for (const x of smap.values()) { const amt = Number(x.asignBdgtAmt) || 0; if (amt <= 1000000 || amt > maxBudget) continue;
      const ddl = kst(x.opninRgstClseDt); if (ddl && ddl < now) continue; const pub = kst(x.rcptDt || x.rgstDt); const name = String(x.prdctClsfcNoNm || '').trim();
      prespecs.push({ name, org: x.rlDminsttNm || x.orderInsttNm, amount: `${won(amt)} (배정예산, VAT포함)`, amountNum: amt, opinionDeadline: ddl ? mmdd(ddl) : '', opinionDeadlineISO: ddl?.toISOString() || null,
        published: pub ? mmdd(pub).replace('-', '/') : '', publishedISO: pub?.toISOString() || null, bfSpecRegNo: x.bfSpecRgstNo, status: '', kw: x._kw, tier: tierOf(name) }); }
    prespecs.sort((a, b) => (b.publishedISO || '').localeCompare(a.publishedISO || ''));
    // ---------- 최종낙찰자 (용역, 최근 winDays 개찰) ----------
    r = await pool(KWS.map(kw => async () => ({ kw, ...(await call(WIN + '/getScsbidListSttusServcPPSSrch', { inqryDiv: '2', inqryBgnDt: stamp(addDays(now, -(opts.winDays || 6))), inqryEndDt: stamp(now, true), bidNtceNm: kw })) })));
    errors.push(...r.errs);
    const wmap = new Map(); for (const res of r.out) for (const x of res?.items || []) { const k = x.bidNtceNo + '-' + x.bidNtceOrd; if (!wmap.has(k)) wmap.set(k, x); }
    const wl = [...wmap.values()].filter(x => tierOf(x.bidNtceNm || '') !== 'event' || opts.allWins);
    // 금액 규칙용 공고 정보 (협상 = 배정예산·사업금액 중 큰 값)
    const info = await pool(wl.map(x => async () => (await call(BID + '/getBidPblancListInfoServc02', { inqryDiv: '2', bidNtceNo: x.bidNtceNo })).items));
    const wins = wl.map((x, i) => { const bi = (info.out[i] || []).find(b => b.bidNtceOrd === x.bidNtceOrd) || (info.out[i] || [])[0] || {};
      const nego = /협상/.test(bi.sucsfbidMthdNm || bi.cntrctCnclsMthdNm || ''); const alot = Number(bi.asignBdgtAmt) || 0, biz = Math.round((Number(bi.presmptPrce) || 0) * 1.1);
      const od = kst(x.rlOpengDt); const name = String(x.bidNtceNm || '').trim();
      return { winner: x.bidwinnrNm, name, org: x.dminsttNm, amount: nego ? (alot >= biz ? `${won(alot)} (배정예산)` : `${won(biz)} (사업금액)`) : `${won(x.sucsfbidAmt)} (낙찰금액)`, bidAmt: Number(x.sucsfbidAmt) || null,
        openDate: od ? mmdd(od).slice(0, 5) : '', openISO: od?.toISOString() || null, method: String(bi.sucsfbidMthdNm || '').split('-')[0], bidPbancNo: x.bidNtceNo, bidPbancOrd: x.bidNtceOrd,
        url: link(x.bidNtceNo, x.bidNtceOrd), tier: tierOf(name), bizno: x.bidwinnrBizno }; }).sort((a, b) => (b.openISO || '').localeCompare(a.openISO || ''));
    Object.assign(stats, { bids: bids.length, prespecs: prespecs.length, wins: wins.length, apiCalls: CALLS, errors: [...new Set(errors)].slice(0, 5) });
    return { generatedAt: now.toISOString(), source: 'data.go.kr', bids, prespecs, wins, stats };
  }
  return { collect, KWS, CORE_KW, BORDER };
})();
