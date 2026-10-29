// GitHub Pages 미리보기용 가상 보드. bridge/simulator.py와 같은 규칙으로 움직입니다.
// 브리지 없이 열린 경우(github.io 또는 ?demo)에만 app.js가 웹소켓·API 대신 이것을 씁니다.
// 숫자는 측정값이 아니며, 화면은 시뮬레이션 배너와 상태 표시로 그 사실을 알립니다.
window.PL3Demo = (() => {
'use strict';

const STATE_NAMES = { 0: 'ok', 1: 'low', 2: 'high' };
const HISTORY_S = 600; // 처음 열 때 그래프가 비어 있지 않도록 10분치를 미리 만듭니다.
const r1 = v => Math.round(v * 10) / 10;
const rangeState = (v, lo, hi) => v < lo ? 1 : v > hi ? 2 : 0;

const b = {
  start: Date.now() - HISTORY_S * 1000,
  signal: 0, auto: false, buzzer: true,
  tempRange: [18, 28], humRange: [30, 80],
  message: '', alarm: false, okReadings: 0, dht: null, alert: '',
};
let onEvent = () => {};
let rid = 0;

// 2초마다 읽는 것은 펌웨어와 같습니다. 온도가 천천히 28 °C를 넘나들어 경보가 보입니다.
function readDht(now) {
  const t = (now - b.start) / 1000;
  if (t < 2 || Math.random() < 0.003) { b.dht = null; return; }
  const temp = r1(26.5 + 2.6 * Math.sin(t / 60));
  const hum = r1(55 + 22 * Math.sin(t / 95 + 1));
  const ts = rangeState(temp, ...b.tempRange), hs = rangeState(hum, ...b.humRange);
  b.dht = { temp, hum, ts, hs, di: r1(0.81 * temp + 0.01 * hum * (0.99 * temp - 14.3) + 46.3) };
  if (ts || hs) { b.alarm = true; b.okReadings = 0; }
  else if (b.alarm && ++b.okReadings >= 3) { b.alarm = false; b.okReadings = 0; }
  if (ts) b.alert = `TEMP ${ts === 2 ? 'HIGH' : 'LOW'} ${temp.toFixed(1).padStart(4)}C`;
  else if (hs) b.alert = `HUMID ${hs === 2 ? 'HIGH' : 'LOW'} ${Math.trunc(hum)}%`;
  else if (!b.alarm) b.alert = '';
}

function state(request, now) {
  const d = b.dht, active = b.auto && b.alarm;
  if (b.auto) b.signal = b.alarm ? 1 : d ? 2 : 0;
  return {
    v: 1, type: 'state', profile: 'PL3', request, ms: now - b.start,
    temperature_c: d ? d.temp : null, humidity_pct: d ? d.hum : null, discomfort_index: d ? d.di : null,
    temp_state: d ? STATE_NAMES[d.ts] : null, hum_state: d ? STATE_NAMES[d.hs] : null,
    alarm: b.alarm, signal: b.signal, blinking: active, auto: b.auto,
    buzzer_enabled: b.buzzer, buzzing: active && b.buzzer,
    temp_range: [...b.tempRange], hum_range: [...b.humRange],
    lcd_ready: true, lcd_message: b.message, lcd_alert: active ? b.alert : '',
  };
}

const link = () => ({ connected: true, port: 'GitHub 미리보기', simulated: true, profile: 'PL3', error: null });

// 미리 만든 기록: 브리지의 /api/history와 같은 모양
const history = [];
for (let n = 0; n < HISTORY_S; n++) {
  const now = b.start + n * 1000;
  if (n % 2 === 0) readDht(now);
  history.push({ received_ms: now, data: state(0, now) });
}
let tick = HISTORY_S;

function connect(handler) {
  onEvent = handler;
  const last = history[history.length - 1];
  onEvent({ type: 'hello', ...link(), last_state_ms: last.received_ms, state: last.data });
  setInterval(() => {
    const now = Date.now();
    if (tick++ % 2 === 0) readDht(now);
    onEvent({ type: 'state', received_ms: now, data: state(0, now) });
  }, 1000);
}

// /api/command와 같은 결과를 돌려줍니다. 재전송은 하지 않습니다.
async function command(name, args = '') {
  name = String(name).trim().toUpperCase(); args = String(args).trim();
  const request = rid = rid >= 65535 ? 1 : rid + 1;
  const line = `${name}${args ? ' ' + args : ''}`;
  const now = Date.now();
  const nums = args ? args.split(/\s+/) : [];
  const ok = { request, command: line, result: 'applied' };
  const bad = { request, command: line, result: 'rejected', code: 'unsupported_or_range' };
  const pair = (lo, hi) => {
    if (nums.length !== 2 || !nums.every(x => /^-?\d+$/.test(x))) return null;
    const [a, c] = nums.map(Number);
    return lo <= a && a < c && c <= hi ? [a, c] : null;
  };
  await new Promise(r => setTimeout(r, 120)); // 실제 왕복처럼 잠깐 기다립니다.
  if (name === 'STATUS' && !args) { const s = state(request, now); onEvent({ type: 'state', received_ms: now, data: s }); return { request, command: line, result: 'state', state: s }; }
  if ((name === 'PING' || name === 'BEEP') && !args) return ok;
  if (name === 'STOP' && !args) { b.auto = false; b.signal = 0; onEvent({ type: 'state', received_ms: now, data: state(request, now) }); return ok; }
  let p;
  if (name === 'SIGNAL' && ['0', '1', '2'].includes(args)) { b.auto = false; b.signal = Number(args); }
  else if (name === 'AUTO' && ['0', '1'].includes(args)) b.auto = args === '1';
  else if (name === 'BUZZ' && ['0', '1'].includes(args)) b.buzzer = args === '1';
  else if (name === 'TEMP' && (p = pair(0, 50))) { b.tempRange = p; readDht(now); }
  else if (name === 'HUM' && (p = pair(0, 100))) { b.humRange = p; readDht(now); }
  else if (name === 'MSG' && args.length <= 16 && /^[\x20-\x7e]*$/.test(args)) b.message = args;
  else return bad;
  return ok;
}

return { connect, command, history: () => history.slice() };
})();
