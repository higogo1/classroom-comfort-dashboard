// 교실 쾌적도(PL3) 대시보드. 브리지(bridge/app.py)가 같은 주소에서 이 파일과 API를 함께 제공합니다.
// 화면 규칙: null(측정 대기)·실제 0·연결 끊김을 섞지 않고, 3초 넘게 값이 없으면 제어를 막습니다.
(() => {
'use strict';

const STALE_MS = 3000;
const MAX_POINTS = 3600;
const SIGNAL = ['꺼짐', '빨강', '초록'];
const RANGE = { ok: '적정', low: '낮음', high: '높음' };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const app = {
  ws: null, wsOpen: false, retry: 0,
  link: null,              // 브리지가 알려 준 보드 연결 상태
  state: null,             // 마지막 보드 state
  stateMs: null,           // 브리지가 그 state를 받은 시각
  points: [],              // {t, temp, hum, di, alarm, signal}
  paused: false,
  rangeS: 600,
  busy: false,             // 명령 전송 중
  prev: null,              // 알림용 직전 상태
  rangeDirty: false,
};

// ---------- 저장해 두는 개인 설정 (WCAG 3.3.7: 다시 입력하지 않게) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('pl2-' + k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('pl2-' + k, v); } catch (e) {} },
};

// ---------- 연결 ----------
// GitHub Pages(브리지 없음)나 ?demo 로 열면 demo.js의 가상 보드를 씁니다.
const DEMO = !!window.PL3Demo && (location.hostname.endsWith('github.io') || new URLSearchParams(location.search).has('demo'));

function connect() {
  if (DEMO) { app.wsOpen = true; window.PL3Demo.connect(onEvent); return; }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  app.ws = ws;
  ws.onopen = () => { app.wsOpen = true; app.retry = 0; };
  ws.onmessage = (ev) => { try { onEvent(JSON.parse(ev.data)); } catch (e) { console.error(e); } };
  ws.onclose = () => {
    app.wsOpen = false;
    app.retry++;
    renderLink();
    setTimeout(connect, Math.min(10000, 1000 * 2 ** (app.retry - 1)));
  };
}

function onEvent(ev) {
  switch (ev.type) {
    case 'hello':
      app.link = ev;
      if (ev.state) { app.state = ev.state; app.stateMs = ev.last_state_ms; }
      renderAll();
      break;
    case 'link':
      announceLink(app.link, ev);
      app.link = ev;
      renderLink();
      break;
    case 'state':
      app.state = ev.data; app.stateMs = ev.received_ms;
      if (app.link) app.link.connected = true;
      addPoint(ev.received_ms, ev.data);
      announceAlarm(ev.data);
      if (!app.paused) renderAll(); else renderLink();
      break;
    case 'log':
      console.warn('보드가 JSON이 아닌 줄을 보냄:', ev.line);
      break;
  }
}

async function loadHistory() {
  try {
    const body = DEMO ? { rows: window.PL3Demo.history() } : await (await fetch('/api/history?seconds=3600')).json();
    app.points = [];
    for (const row of body.rows) addPoint(row.received_ms, row.data);
    renderCharts();
  } catch (e) { /* 브리지가 아직 꺼져 있으면 웹소켓 재연결 후 쌓입니다 */ }
}

function addPoint(t, d) {
  app.points.push({ t, temp: d.temperature_c, hum: d.humidity_pct, di: d.discomfort_index, alarm: d.alarm, signal: d.signal });
  if (app.points.length > MAX_POINTS) app.points.shift();
}

// ---------- 상태 판단 ----------
function ageMs() { return app.stateMs == null ? Infinity : Date.now() - app.stateMs; }
function isStale() { return ageMs() > STALE_MS; }
function canControl() { return app.wsOpen && app.link && app.link.connected && !isStale(); }
function fmtAge(ms) { if (!isFinite(ms)) return '받은 값 없음'; const s = Math.round(ms / 1000); return s < 60 ? `${s}초 전` : `${Math.floor(s / 60)}분 ${s % 60}초 전`; }
function fmtTime(t) { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
function lampText(s) { return s.blinking ? '빨강 깜박임' : SIGNAL[s.signal] ?? '?'; }
function staleNote() { return isStale() ? ` · 마지막 값 ${fmtAge(ageMs())}` : ''; }

// ---------- 그리기 ----------
function renderAll() { renderLink(); renderSummary(); renderTiles(); renderControls(); renderCharts(); renderTable(); }

function renderLink() {
  const pill = $('#link-pill'), text = $('#link-text');
  let cls, msg;
  if (!app.wsOpen && app.retry === 0) { cls = 'pill-wait'; msg = '브리지에 연결하는 중'; }
  else if (!app.wsOpen) { cls = 'pill-bad'; msg = '브리지 프로그램과 연결 끊김 · 다시 시도 중'; }
  else if (!app.link || !app.link.connected) { cls = 'pill-bad'; msg = '보드 연결 없음' + (app.link && app.link.error ? ` · ${app.link.error}` : ''); }
  else if (isStale()) { cls = 'pill-bad'; msg = `값 멈춤 · 마지막 값 ${fmtAge(ageMs())}`; }
  else if (app.link.simulated) { cls = 'pill-sim'; msg = '시뮬레이션 · 측정값 아님'; }
  else { cls = 'pill-ok'; msg = `보드 연결됨 · ${app.link.port} · ${app.link.profile}`; }
  pill.className = 'pill ' + cls;
  if (text.textContent !== msg) text.textContent = msg;
  $('#sim-banner').hidden = !(app.link && app.link.simulated);
  renderLock();
}

function renderLock() {
  const ok = canControl();
  $$('[data-needs-link]').forEach(el => {
    const off = !ok || app.busy;
    if (el.tagName === 'FIELDSET') $$('input', el).forEach(i => { i.disabled = off; });
    else el.disabled = off;
  });
  const lock = $('#control-lock');
  lock.hidden = ok;
  if (!ok) lock.textContent = !app.wsOpen ? '브리지 프로그램이 꺼져 있어 제어할 수 없습니다.'
    : (!app.link || !app.link.connected) ? '보드가 연결되지 않아 제어할 수 없습니다.'
    : '3초 넘게 새 값이 없어 제어를 막았습니다. LED나 부저가 꺼졌다고 가정하지 마세요.';
}

function renderSummary() {
  const s = app.state, lamp = $('#lamp');
  $$('.bulb', lamp).forEach(b => {
    const on = !!s && Number(b.dataset.sig) === s.signal;
    b.classList.toggle('on', on);
    b.classList.toggle('blink', on && !!s.blinking && !isStale());
  });
  if (!s) return;
  lamp.setAttribute('aria-label', `신호등: ${lampText(s)}${s.auto ? ', 자동 판정' : ', 직접 지정'}`);
  $('#summary-line').textContent = headline(s);
  const vals = s.temperature_c == null ? '온도·습도 측정 대기' : `온도 ${s.temperature_c.toFixed(1)}°C · 습도 ${s.humidity_pct.toFixed(0)}%`;
  const buzz = s.buzzing ? ' · 부저 울림' : s.alarm && s.auto && !s.buzzer_enabled ? ' · 부저 음소거' : '';
  $('#summary-sub').textContent = `${vals} · 신호등 ${lampText(s)} (${s.auto ? '자동 판정' : '직접 지정'})${buzz}${staleNote()}`;
  renderBoard(s);
}

// 헤드라인은 지금 상태를 한 문장으로 말합니다 (ISO 9241-110 과업 적합성).
const TEMP_PHRASE = { high: '교실이 너무 더워요', low: '교실이 너무 추워요' };
const HUM_PHRASE = { high: '습도가 너무 높아요', low: '공기가 너무 건조해요' };
function headline(s) {
  if (s.temp_state == null) return '온도·습도 측정을 기다리는 중이에요.';
  const parts = [];
  if (s.temp_state !== 'ok') parts.push(TEMP_PHRASE[s.temp_state]);
  if (s.hum_state !== 'ok') parts.push(HUM_PHRASE[s.hum_state]);
  if (parts.length) return parts.join(', ') + '.';
  return s.alarm ? '적정 범위로 돌아오는 중이에요.' : '교실이 쾌적해요.';
}

// 보드 화면: 펌웨어 drawLcd()와 같은 규칙으로 LCD 두 줄을 다시 그립니다.
function renderBoard(s) {
  const pad = t => String(t).slice(0, 16).padEnd(16, ' ');
  $('#lcd-line1').textContent = pad(s.temperature_c == null ? 'DHT waiting'
    : `T ${s.temperature_c.toFixed(1).padStart(4)}C  H ${String(Math.trunc(s.humidity_pct)).padStart(2)}%`);
  $('#lcd-line2').textContent = pad(s.lcd_alert || s.lcd_message
    || `SIG:${'-RG'[s.signal]} ${s.auto ? 'AUT' : 'MAN'} BZ:${s.buzzer_enabled ? 'ON' : 'OFF'}`);
  const badge = $('#buzz-badge');
  badge.textContent = s.buzzing ? '경보음 울리는 중' : s.buzzer_enabled ? '경보음 켜짐' : '경보음 꺼짐';
  badge.classList.toggle('off', !s.buzzer_enabled);
}

function setTile(id, valueText, isWait, chip, note) {
  const tile = $('#' + id), v = $('[data-v]', tile);
  v.textContent = valueText;
  v.className = isWait ? 'wait' : '';
  tile.classList.toggle('stale', isStale());
  const c = $('[data-chip]', tile);
  if (c) { c.hidden = chip == null; if (chip) { c.className = 'chip ' + chip.cls; c.textContent = chip.text; } }
  if (note != null) $('[data-note]', tile).textContent = note;
}
const rangeChip = (state, [lo, hi], unit) => state == null ? null : { cls: state, text: `${RANGE[state]} · 범위 ${lo}–${hi}${unit}` };

function renderTiles() {
  const s = app.state; if (!s) return;
  const st = staleNote();
  setTile('tile-temp', s.temperature_c == null ? '측정 대기' : s.temperature_c.toFixed(1), s.temperature_c == null,
    rangeChip(s.temp_state, s.temp_range, '°C'), '온습도 센서 DHT11 · 오차 약 ±2°C' + st);
  setTile('tile-hum', s.humidity_pct == null ? '측정 대기' : s.humidity_pct.toFixed(0), s.humidity_pct == null,
    rangeChip(s.hum_state, s.hum_range, '%'), '온습도 센서 DHT11 · 오차 약 ±5%' + st);
  const alarmChip = s.alarm ? { cls: 'high', text: s.auto ? (s.buzzing ? '깜박임 · 부저 울림' : '깜박임 · 부저 음소거') : '직접 지정 중이라 경보 꺼짐' } : { cls: 'ok', text: '정상' };
  setTile('tile-alarm', s.alarm ? '범위 벗어남' : '없음', false, alarmChip,
    (s.lcd_alert ? `LCD: ${s.lcd_alert}` : '범위를 벗어나면 빨강 깜박임·부저·LCD 문구') + st);
  setTile('tile-di', s.discomfort_index == null ? '측정 대기' : s.discomfort_index.toFixed(1), s.discomfort_index == null, null, '신호등 판정에는 쓰지 않습니다.' + st);
}

function renderControls() {
  const s = app.state; if (!s) return;
  if (!app.busy) $$('input[name="mode"]').forEach(r => { r.checked = (r.value === '1') === !!s.auto; });
  $$('[data-signal]').forEach(b => {
    const cur = !s.auto && Number(b.dataset.signal) === s.signal;
    b.classList.toggle('current', cur);
    b.setAttribute('aria-pressed', String(cur));
  });
  const bz = $('#buzz-btn');
  bz.setAttribute('aria-pressed', String(!!s.buzzer_enabled));
  bz.textContent = s.buzzer_enabled ? '경보음 켜짐' : '경보음 꺼짐 (음소거)';
  if (!app.rangeDirty) fillRange(s);
  $('#lcd-now').textContent = `지금 표시: ${s.lcd_alert ? '경보 “' + s.lcd_alert + '”' : s.lcd_message ? '“' + s.lcd_message + '”' : '없음'}${s.lcd_ready ? '' : ' (LCD 응답 없음)'}`;
  renderLock();
}

function fillRange(s) {
  $('#temp_low').value = s.temp_range[0]; $('#temp_high').value = s.temp_range[1];
  $('#hum_low').value = s.hum_range[0]; $('#hum_high').value = s.hum_range[1];
}

function renderTable() {
  const rows = app.points.slice(-20).reverse().map(p => `<tr><td>${fmtTime(p.t)}</td><td>${p.temp == null ? '측정 대기' : p.temp.toFixed(1)}</td><td>${p.hum == null ? '측정 대기' : p.hum.toFixed(0)}</td><td>${p.di == null ? '–' : p.di.toFixed(1)}</td><td>${p.alarm ? '범위 벗어남' : '없음'}</td><td>${SIGNAL[p.signal]}</td></tr>`);
  $('#table-body').innerHTML = rows.join('') || '<tr><td colspan="6">아직 기록이 없습니다.</td></tr>';
}

// ---------- 차트: 계열 하나씩, 적정 범위는 글자와 함께 ----------
const charts = {
  temp: { box: '#chart-temp', key: 'temp', label: '온도', unit: '°C', fmt: v => v.toFixed(1), range: s => s && s.temp_range,
          domain: (vals, r) => [Math.min(...vals, r ? r[0] - 2 : 15), Math.max(...vals, r ? r[1] + 2 : 32)] },
  hum: { box: '#chart-hum', key: 'hum', label: '습도', unit: '%', fmt: v => v.toFixed(0), range: s => s && s.hum_range,
         domain: (vals, r) => [Math.max(0, Math.min(...vals, r ? r[0] - 5 : 20)), Math.min(100, Math.max(...vals, r ? r[1] + 5 : 90))] },
};

function niceTicks(lo, hi, n = 4) {
  const span = hi - lo, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(m => m * mag).find(st => st >= raw);
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

function renderCharts() { for (const c of Object.values(charts)) drawChart(c); }

function drawChart(c) {
  const box = $(c.box); const W = box.clientWidth || 600, H = box.clientHeight || 180;
  const M = { l: 44, r: 72, t: 10, b: 24 };
  const now = Date.now(), t0 = now - app.rangeS * 1000;
  const pts = app.points.filter(p => p.t >= t0);
  const vals = pts.map(p => p[c.key]).filter(v => v != null);
  const rng = c.range(app.state);
  const [lo, hi] = c.domain(vals, rng);
  const x = t => M.l + (t - t0) / (now - t0) * (W - M.l - M.r);
  const y = v => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${c.label} 추세, 최근 ${app.rangeS / 60}분. 같은 값이 아래 표에 있습니다.">`;
  for (const v of niceTicks(lo, hi)) {
    svg += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" stroke-width="1"/>`;
    svg += `<text x="${M.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`;
  }
  svg += `<line x1="${M.l}" x2="${W - M.r}" y1="${H - M.b}" y2="${H - M.b}" stroke="var(--axis)"/>`;
  const steps = app.rangeS <= 600 ? 5 : 6;
  for (let i = 0; i <= steps; i++) {
    const t = t0 + (now - t0) * i / steps;
    svg += `<text x="${x(t)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">${i === steps ? '지금' : `-${Math.round((now - t) / 60000)}분`}</text>`;
  }
  if (rng) ['하한', '상한'].forEach((name, i) => {
    const v = rng[i]; if (v < lo || v > hi) return;
    svg += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--ink-2)" stroke-width="1" stroke-dasharray="4 4"/>`;
    svg += `<text x="${W - M.r + 6}" y="${y(v) + 4}" font-size="11" fill="var(--ink-2)">${name} ${v}${c.unit}</text>`;
  });
  // null은 선을 끊어서 표시합니다 (0으로 그리지 않음). 끊긴 구간마다 아래로 옅은 노랑 면을 채웁니다.
  const segs = []; let seg = null;
  for (const p of pts) {
    const v = p[c.key];
    if (v == null) { seg = null; continue; }
    if (!seg) segs.push(seg = []);
    seg.push([x(p.t).toFixed(1), y(v).toFixed(1)]);
  }
  const base = (H - M.b).toFixed(1);
  svg += `<defs><linearGradient id="fill-${c.key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--series);stop-opacity:.32"/><stop offset="1" style="stop-color:var(--series);stop-opacity:0"/></linearGradient></defs>`;
  for (const sg of segs) {
    const line = sg.map((q, i) => `${i ? 'L' : 'M'}${q[0]},${q[1]}`).join('');
    svg += `<path d="${line}L${sg[sg.length - 1][0]},${base}L${sg[0][0]},${base}Z" fill="url(#fill-${c.key})"/>`;
    svg += `<path d="${line}" fill="none" stroke="var(--series)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  const last = [...pts].reverse().find(p => p[c.key] != null);
  if (last) {
    const lx = x(last.t), ly = y(last[c.key]), label = `지금 ${c.fmt(last[c.key])}${c.unit}`;
    svg += `<circle cx="${lx}" cy="${ly}" r="5" fill="var(--series)" stroke="var(--panel-a)" stroke-width="2"/>`;
    svg += `<text x="${lx - 8}" y="${Math.max(12, ly - 12)}" text-anchor="end" font-size="11.5" font-weight="700" fill="var(--ink)" stroke="var(--panel-b)" stroke-width="4" paint-order="stroke">${label}</text>`;
  }
  if (!vals.length) svg += `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="13" fill="var(--muted)">이 기간에 값이 없습니다</text>`;
  svg += `<g class="hover" visibility="hidden"><line y1="${M.t}" y2="${H - M.b}" stroke="var(--ink-2)" stroke-width="1"/><circle r="5" fill="var(--series)" stroke="var(--panel-a)" stroke-width="2"/></g>`;
  svg += `<rect class="hit" x="${M.l}" y="0" width="${W - M.l - M.r}" height="${H}" fill="transparent"/></svg><div class="tip" hidden></div>`;
  box.innerHTML = svg;
  const hit = $('.hit', box), g = $('.hover', box), tip = $('.tip', box);
  const withV = pts.filter(p => p[c.key] != null);
  // 1초마다 다시 그려도 마우스가 올라가 있던 위치의 안내를 유지합니다.
  const showAt = (clientX) => {
    if (!withV.length) return;
    const rect = box.getBoundingClientRect(); const mx = (clientX - rect.left) * (W / rect.width);
    const tm = t0 + (mx - M.l) / (W - M.l - M.r) * (now - t0);
    let best = withV[0]; for (const p of withV) if (Math.abs(p.t - tm) < Math.abs(best.t - tm)) best = p;
    const px = x(best.t), py = y(best[c.key]);
    g.setAttribute('visibility', 'visible');
    $('line', g).setAttribute('x1', px); $('line', g).setAttribute('x2', px);
    $('circle', g).setAttribute('cx', px); $('circle', g).setAttribute('cy', py);
    tip.hidden = false; tip.textContent = `${fmtTime(best.t)} · ${c.label} ${c.fmt(best[c.key])}${c.unit}`;
    tip.style.left = `${px / W * rect.width}px`; tip.style.top = `${py / H * rect.height}px`;
  };
  hit.addEventListener('pointermove', (e) => { c.hoverX = e.clientX; showAt(e.clientX); });
  hit.addEventListener('pointerleave', () => { c.hoverX = null; g.setAttribute('visibility', 'hidden'); tip.hidden = true; });
  if (c.hoverX != null) showAt(c.hoverX);
}

// ---------- 알림 (WCAG 4.1.3: 바뀔 때만 읽어 줌) ----------
function say(el, text) { el.textContent = ''; setTimeout(() => { el.textContent = text; }, 50); }
function announceAlarm(s) {
  const p = app.prev; app.prev = { alarm: s.alarm, temp: s.temp_state, hum: s.hum_state };
  if (!p) return;
  if (s.alarm && !p.alarm) say($('#alerts'), `경보: ${s.lcd_alert || '온도 또는 습도가 범위를 벗어남'}`);
  else if (!s.alarm && p.alarm) say($('#alerts'), '경보 해제: 온도와 습도가 적정 범위입니다');
}
function announceLink(prev, next) {
  if (!prev || prev.connected === next.connected) return;
  say($('#alerts'), next.connected ? '보드가 연결되었습니다' : '보드 연결이 끊겼습니다');
}

// ---------- 명령 ----------
const RESULT = {
  applied: ['보드 적용됨', 'ok'],
  state: ['상태 받음', 'ok'],
  rejected: ['보드가 거절함', 'bad'],
  invalid: ['보내지 않음', 'bad'],
  timeout: ['응답 없음 · 적용됐는지 알 수 없음. 상태를 확인한 뒤 다시 보내세요', 'unk'],
  not_connected: ['보드 연결 없음 · 보내지 않음', 'bad'],
  link_lost: ['전송 중 연결 끊김 · 적용됐는지 알 수 없음', 'unk'],
  network: ['브리지 프로그램에 연결할 수 없음', 'bad'],
};
const SEE = { SIGNAL: ' · LED는 눈으로 확인하세요', BEEP: ' · 소리가 났는지 확인하세요' };

function logEntry(text) {
  const log = $('#cmd-log');
  if (log.firstElementChild && log.firstElementChild.classList.contains('muted')) log.innerHTML = '';
  const li = document.createElement('li');
  li.innerHTML = `<span class="t">${fmtTime(Date.now())}</span><span class="c"></span><span class="r unk">전송 중…</span>`;
  $('.c', li).textContent = text;
  log.prepend(li);
  while (log.children.length > 30) log.lastElementChild.remove();
  return li;
}

async function send(command, args = '', label) {
  if (app.busy) return null;
  app.busy = true; renderLock();
  const li = logEntry(label || `${command} ${args}`.trim());
  let body;
  if (DEMO) body = await window.PL3Demo.command(command, args);
  else try {
    const r = await fetch('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command, args }) });
    body = await r.json();
    if (r.status === 422) body = { result: 'invalid', code: body.detail.code, message: body.detail.message };
  } catch (e) { body = { result: 'network' }; }
  const [text, cls] = RESULT[body.result] || [body.result, 'unk'];
  const extra = body.message ? ` · ${body.message}` : body.code ? ` (${body.code})` : '';
  const see = body.result === 'applied' ? (SEE[command] || '') : '';
  const r = $('.r', li); r.className = 'r ' + cls; r.textContent = text + extra + see;
  say($('#cmd-status'), `${label || command}: ${text}${extra}`);
  app.busy = false; renderLock(); renderControls();
  return body;
}

// ---------- 적정 범위 폼 (WCAG 3.3.1 오류 표시, 2.5.7 끌지 않는 조작) ----------
const RANGE_IDS = ['temp_low', 'temp_high', 'hum_low', 'hum_high'];
function setErr(id, msg) { const inp = $('#' + id); $('#' + id + '-err').textContent = msg || ''; if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }

function validateRange() {
  RANGE_IDS.forEach(id => setErr(id));
  let first = null;
  const bad = (id, msg) => { setErr(id, msg); first = first || id; };
  const v = {};
  for (const id of RANGE_IDS) {
    const inp = $('#' + id), f = inp.closest('.field'), raw = inp.value.trim(), n = Number(raw);
    const min = Number(f.dataset.min), max = Number(f.dataset.max);
    if (raw === '' || !Number.isInteger(n)) bad(id, '정수를 입력하세요.');
    else if (n < min || n > max) bad(id, `${min}~${max} 사이로 입력하세요.`);
    v[id] = n;
  }
  if (!first && v.temp_low >= v.temp_high) bad('temp_low', `온도 하한(${v.temp_low})은 상한(${v.temp_high})보다 작아야 합니다.`);
  if (!first && v.hum_low >= v.hum_high) bad('hum_low', `습도 하한(${v.hum_low})은 상한(${v.hum_high})보다 작아야 합니다.`);
  if (first) { $('#' + first).focus(); return null; }
  return v;
}

$('#range-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = validateRange(); if (!v || !app.state) return;
  const s = app.state;
  if (v.temp_low !== s.temp_range[0] || v.temp_high !== s.temp_range[1]) await send('TEMP', `${v.temp_low} ${v.temp_high}`, `온도 범위 ${v.temp_low}–${v.temp_high}°C`);
  if (v.hum_low !== s.hum_range[0] || v.hum_high !== s.hum_range[1]) await send('HUM', `${v.hum_low} ${v.hum_high}`, `습도 범위 ${v.hum_low}–${v.hum_high}%`);
  app.rangeDirty = false;
});
$('#range-form').addEventListener('input', () => { app.rangeDirty = true; });
$('#range-form').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-step]'); if (!b) return;
  const f = b.closest('.field'), inp = $('input', f);
  const n = (Number(inp.value) || 0) + Number(b.dataset.step) * Number(f.dataset.step);
  inp.value = Math.min(Number(f.dataset.max), Math.max(Number(f.dataset.min), n));
  app.rangeDirty = true; setErr(inp.id);
});
$('#range-reset').addEventListener('click', () => {
  app.rangeDirty = false; RANGE_IDS.forEach(id => setErr(id));
  if (app.state) fillRange(app.state);
});

// ---------- LCD 문구 ----------
const lcdInput = $('#lcd-text');
function lcdError(text) {
  if (text.length > 16) return '16자 이하로 입력하세요.';
  const badCh = [...text].find(ch => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) > 0x7e);
  if (badCh) return `“${badCh}”는 LCD에 표시할 수 없습니다. 영문·숫자·기본 기호만 됩니다.`;
  return '';
}
lcdInput.value = store.get('lcd-draft', '');
function lcdUpdate() {
  $('#lcd-count').textContent = `${lcdInput.value.length}/16`;
  const msg = lcdError(lcdInput.value);
  $('#lcd-err').textContent = msg;
  if (msg) lcdInput.setAttribute('aria-invalid', 'true'); else lcdInput.removeAttribute('aria-invalid');
  store.set('lcd-draft', lcdInput.value);
}
lcdInput.addEventListener('input', lcdUpdate);
lcdUpdate();
$('#lcd-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = lcdInput.value;
  if (lcdError(text)) { lcdInput.focus(); return; }
  if (!text.trim()) { $('#lcd-err').textContent = '보낼 문구를 입력하세요. 지우려면 “문구 지우기”를 누르세요.'; lcdInput.focus(); return; }
  send('MSG', text, `LCD 문구 “${text}”`);
});
$('#lcd-clear').addEventListener('click', () => send('MSG', '', 'LCD 문구 지우기'));

// ---------- 나머지 제어 ----------
$('#stop-btn').addEventListener('click', () => send('STOP', '', '모두 끄기 (STOP)'));
$$('[data-signal]').forEach(b => b.addEventListener('click', () => send('SIGNAL', b.dataset.signal, `신호등 ${SIGNAL[b.dataset.signal]}`)));
$$('input[name="mode"]').forEach(r => r.addEventListener('change', () => send('AUTO', r.value, r.value === '1' ? '자동 판정 켜기' : '자동 판정 끄기')));
$('#buzz-btn').addEventListener('click', () => {
  const on = !(app.state && app.state.buzzer_enabled);
  send('BUZZ', on ? '1' : '0', on ? '경보음 켜기' : '경보음 끄기 (음소거)');
});
$('#beep-btn').addEventListener('click', () => send('BEEP', '', '부저 시험 소리'));

$$('input[name="range"]').forEach(r => {
  if (r.value === store.get('range', '600')) r.checked = true;
  r.addEventListener('change', () => { app.rangeS = Number(r.value); store.set('range', r.value); renderCharts(); });
});
app.rangeS = Number(store.get('range', '600'));

$('#pause-btn').addEventListener('click', (e) => {
  app.paused = !app.paused;
  e.currentTarget.setAttribute('aria-pressed', String(app.paused));
  e.currentTarget.textContent = app.paused ? '화면 갱신 다시 시작' : '화면 갱신 멈춤';
  $('#paused-banner').hidden = !app.paused;
  if (!app.paused) renderAll();
});

const themeSel = $('#theme-select');
themeSel.value = store.get('theme', 'dark');
themeSel.addEventListener('change', () => {
  const v = themeSel.value; store.set('theme', v);
  if (v === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
  renderCharts();
});

// 값이 끊겨도 "n초 전"과 잠금 상태가 갱신되도록 0.5초마다 다시 계산합니다.
setInterval(() => { renderLink(); if (isStale() && !app.paused) { renderSummary(); renderTiles(); } }, 500);
let resizeTimer; window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderCharts, 150); });

renderLink();
loadHistory().then(connect);
})();
