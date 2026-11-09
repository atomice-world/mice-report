# Supertonic 3(오픈 가중치, OpenRAIL-M)로 낭독 MP3를 만든다.
#   python cloud/voice/synth.py /tmp/segs.json            -> audio/brief.mp3 + audio/brief.json
#   python cloud/voice/synth.py --samples                 -> audio/samples/{F1..M5}.mp3 + audio/samples.html
# 환경변수: ST_SRC(아카이브 소스 경로, 기본 st_src), ST_ASSETS(모델 경로, 기본 st_assets), VOICE, SPEED, STEPS
import json, os, subprocess, sys, time

import numpy as np
import soundfile as sf

ST_SRC = os.environ.get("ST_SRC", "st_src")
ASSETS = os.environ.get("ST_ASSETS", "st_assets")
sys.path.insert(0, os.path.join(ST_SRC, "py"))
from helper import load_text_to_speech, load_voice_style  # noqa: E402

cfg_path = os.path.join(os.path.dirname(__file__), "config.json")
cfg = json.load(open(cfg_path, encoding="utf-8")) if os.path.exists(cfg_path) else {}
VOICE = os.environ.get("VOICE") or cfg.get("voice", "F1")
SPEED = float(os.environ.get("SPEED") or cfg.get("speed", 1.0))
STEPS = int(os.environ.get("STEPS") or cfg.get("steps", 10))
GAP = float(cfg.get("gap", 0.45))

tts = load_text_to_speech(os.path.join(ASSETS, "onnx"), False)
SR = tts.sample_rate


def style_of(v):
    return load_voice_style([os.path.join(ASSETS, "voice_styles", f"{v}.json")])


def synth(text, style):
    wav, dur = tts(text, "ko", style, STEPS, SPEED)
    return wav[0, : int(SR * float(np.asarray(dur).reshape(-1)[0]))]


def to_mp3(wav, out):
    peak = float(np.max(np.abs(wav))) or 1.0
    tmp = "/tmp/_tts.wav"
    sf.write(tmp, (wav / peak * 0.9).astype(np.float32), SR)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-ac", "1", "-ar", "24000", "-b:a", "48k", out], check=True)


if len(sys.argv) > 1 and sys.argv[1] == "--samples":
    line = "안녕하세요. 십일월 구일 마이스 및 피씨오업계 소식 리포트입니다. 오늘의 핵심, 부산시가 이천이십칠 세계항구도시협회 총회 유치를 확정했습니다."
    voices = ["F1", "F2", "F3", "F4", "F5", "M1", "M2", "M3", "M4", "M5"]
    for v in voices:
        to_mp3(synth(line, style_of(v)), f"audio/samples/{v}.mp3")
        print("sample", v)
    rows = "".join(f"<tr><td><b>{v}</b>{' (현재)' if v == VOICE else ''}</td><td><audio controls preload='none' src='samples/{v}.mp3?v={int(time.time())}'></audio></td></tr>" for v in voices)
    open("audio/samples.html", "w", encoding="utf-8").write(
        "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>AI 낭독 음성 샘플</title>"
        "<body style=\"font-family:'Malgun Gothic',sans-serif;max-width:640px;margin:30px auto;padding:0 16px\"><h2>AI 낭독 음성 샘플 (Supertonic 3)</h2>"
        f"<p>F=여성, M=남성. 속도 {SPEED}, 품질 단계 {STEPS}. 마음에 드는 번호를 알려 주세요.</p><table cellpadding='8'>{rows}</table></body>")
    sys.exit(0)

data = json.load(open(sys.argv[1], encoding="utf-8"))
style = style_of(VOICE)
gap = np.zeros(int(GAP * SR), dtype=np.float32)
parts, segs, t = [], [], 0.0
t0 = time.time()
for s in data["segs"]:
    w = synth(s["say"], style) if s["say"].strip() else np.zeros(int(0.2 * SR), dtype=np.float32)
    segs.append({"start": round(t, 3), "end": round(t + len(w) / SR, 3)})
    parts += [w, gap]
    t += (len(w) + len(gap)) / SR
to_mp3(np.concatenate(parts), "audio/brief.mp3")
json.dump({"date": data["date"], "hash": data["hash"], "voice": VOICE, "speed": SPEED, "steps": STEPS,
           "file": "audio/brief.mp3", "duration": round(t, 2), "segs": segs,
           "engine": "Supertonic 3 (Supertone, OpenRAIL-M)", "generated": time.strftime("%Y-%m-%d %H:%M:%S")},
          open("audio/brief.json", "w", encoding="utf-8"), ensure_ascii=False)
print(f"brief.mp3 {t:.1f}s, {len(segs)} segs, synth {time.time() - t0:.1f}s, voice {VOICE}")
