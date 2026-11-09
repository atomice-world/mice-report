// index.html의 음성 플레이어 스크립트를 jsdom에서 그대로 실행해 낭독 구간(segs)을 뽑는다.
// 브라우저와 같은 코드로 구간을 만들므로 해시(segHash)가 일치하면 플레이어가 MP3를 쓴다.
// 사용: node cloud/voice/segments.mjs index.html > /tmp/segs.json
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const file = process.argv[2] || 'index.html';
const html = fs.readFileSync(file, 'utf8');
const pron = new Function(fs.readFileSync(new URL('./pron.js', import.meta.url), 'utf8') + '; return pron;')();

const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/Not implemented/.test(String(e.message))) console.error('jsdom:', e.message); });
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.invalid/', virtualConsole: vc,
  beforeParse(w) {
    w.speechSynthesis = { getVoices: () => [], speak() {}, cancel() {}, pause() {}, resume() {} };
    w.SpeechSynthesisUtterance = function (t) { this.text = t; };
    w.HTMLCanvasElement.prototype.getContext = () => null;
    w.Element.prototype.scrollIntoView = () => {};
  },
});
await new Promise(r => setTimeout(r, 100));
const t = dom.window.miceTTS;
if (!t || !t.segs?.length) { console.error('플레이어 구간을 찾지 못함(index.html에 음성 플레이어가 없음?)'); process.exit(2); }
const date = (html.match(/기준일 (\d{4}-\d\d-\d\d)/) || [])[1] || '';
const out = { date, hash: t.hash, briefEnd: t.briefEnd, segs: t.segs.map(s => ({ text: s.text, say: pron(s.text) })) };
process.stdout.write(JSON.stringify(out, null, 1));
dom.window.close();
