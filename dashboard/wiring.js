// PL3 빵판 배선도. 부품 하나를 한 단계로 묶고, 그림 속 번호와 오른쪽 할 일 번호를 맞춥니다.
// 세로 빵판·연두 띠 = 속으로 이어진 구멍 5개·가운데 홈 양쪽은 안 이어짐·모듈은 암–수 선으로 J열에 꽂음.
(() => {
'use strict';

// ---------- PL3 배선 명세 (firmware/PL3/pins.h와 같은 핀, 구멍 위치는 이전 배선도와 같음) ----------
// 단계마다 items 순서 = 그림 번호 = 할 일 번호. part는 부품, wire는 선 하나.
const SPEC = {
  title: 'PL3 · 교실 쾌적도',
  steps: [
    {
      name: '전원 길 만들기',
      goal: 'UNO의 + 전기(5V)와 − 전기(GND)를 빵판 1번 줄과 2번 줄로 가져와요.',
      items: [
        { wire: { from: 'UNO:5V', to: 'A1', role: '5v' }, say: '빨간 선: UNO 5V → 빵판 A1' },
        { wire: { from: 'UNO:GND', to: 'A2', role: 'gnd' }, say: '검은 선: UNO GND → 빵판 A2' },
        { wire: { from: 'E1', to: 'F1', role: '5v' }, say: '빨간 선: E1 → F1 (가운데 홈을 건너요)' },
        { wire: { from: 'E2', to: 'F2', role: 'gnd' }, say: '검은 선: E2 → F2 (가운데 홈을 건너요)' },
      ],
      tips: ['이제 1번 줄은 +, 2번 줄은 −예요.', '빨간 선과 검은 선이 같은 줄에 꽂히면 안 돼요.'],
    },
    {
      name: '빨강 LED',
      goal: '덥거나 습할 때 깜박이는 빨간 불이에요.',
      items: [
        { part: { type: 'R', holes: ['C10', 'C12'] }, say: '저항: C10과 C12에 꽂아요 (방향은 상관없어요)' },
        { part: { type: 'LED', color: '#e5483a', holes: ['E12', 'E13'] }, say: '빨강 LED: 긴 다리 E12, 짧은 다리 E13' },
        { wire: { from: 'UNO:D10', to: 'A10' }, say: '선: UNO 10번 → A10' },
        { wire: { from: 'B2', to: 'A13', role: 'gnd' }, say: '검은 선: B2 → A13' },
      ],
      tips: ['LED는 긴 다리가 +예요. 거꾸로 꽂으면 불이 안 켜져요.'],
    },
    {
      name: '부저',
      goal: '경고할 때 삐 소리를 내요.',
      items: [
        { part: { type: 'R', holes: ['C14', 'C16'] }, say: '저항: C14와 C16에 꽂아요' },
        { part: { type: 'BUZ', holes: ['E16', 'E18'] }, say: '부저: + 표시 다리 E16, 다른 다리 E18' },
        { wire: { from: 'UNO:D8', to: 'A14' }, say: '선: UNO 8번 → A14' },
        { wire: { from: 'C2', to: 'A18', role: 'gnd' }, say: '검은 선: C2 → A18' },
      ],
      tips: ['스티커가 붙은 부저(혼자 소리 나는 능동형)라면 꽂지 말고 선생님께 물어보세요.'],
    },
    {
      name: '초록 LED',
      goal: '교실이 쾌적할 때 켜지는 초록 불이에요.',
      items: [
        { part: { type: 'R', holes: ['C20', 'C22'] }, say: '저항: C20과 C22에 꽂아요' },
        { part: { type: 'LED', color: '#3fae4f', holes: ['E22', 'E23'] }, say: '초록 LED: 긴 다리 E22, 짧은 다리 E23' },
        { wire: { from: 'UNO:D12', to: 'A20' }, say: '선: UNO 12번 → A20' },
        { wire: { from: 'D2', to: 'A23', role: 'gnd' }, say: '검은 선: D2 → A23' },
      ],
    },
    {
      name: '온습도 센서',
      goal: '온도와 습도를 함께 재는 파란 센서(DHT11)예요.',
      items: [
        { part: { type: 'MOD', color: '#2f6db3', holes: ['J10', 'J12', 'J14'], pins: ['+', '−', 'S'] }, say: '센서 다리 3개를 암–수 선으로: + → J10, − → J12, S → J14' },
        { wire: { from: 'G1', to: 'F10', role: '5v' }, say: '빨간 선: G1 → F10' },
        { wire: { from: 'G2', to: 'F12', role: 'gnd' }, say: '검은 선: G2 → F12' },
        { wire: { from: 'UNO:D4', to: 'F14' }, say: '선: UNO 4번 → F14' },
      ],
      tips: ['센서 다리 옆에 적힌 글자(S, +, −)를 보고 꽂아요. 그림의 순서와 실물 순서가 다를 수 있어요.', '+와 −를 바꿔 꽂으면 센서가 뜨거워져요. 뜨거우면 바로 USB를 빼요.'],
    },
    {
      name: 'LCD 화면',
      goal: '온도와 경고 글자를 보여 주는 화면이에요.',
      items: [
        { part: { type: 'MOD', color: '#3d3f8f', holes: ['J16', 'J18', 'J20', 'J22'], pins: ['GND', 'VCC', 'SDA', 'SCL'] }, say: 'LCD 뒤 핀 4개를 암–수 선으로: GND → J16, VCC → J18, SDA → J20, SCL → J22' },
        { wire: { from: 'H2', to: 'F16', role: 'gnd' }, say: '검은 선: H2 → F16' },
        { wire: { from: 'H1', to: 'F18', role: '5v' }, say: '빨간 선: H1 → F18' },
        { wire: { from: 'UNO:A4', to: 'F20' }, say: '선: UNO A4 → F20' },
        { wire: { from: 'UNO:A5', to: 'F22' }, say: '선: UNO A5 → F22' },
      ],
      tips: ['A4, A5는 UNO 아래쪽 줄에 있어요. 위쪽 4번 핀과 헷갈리지 마세요.'],
    },
  ],
  ready: {
    kicker: '준비',
    title: '시작하기 전에',
    goal: 'USB 선을 빼고 시작해요. 다 꽂을 때까지 빼 둬요.',
    items: [
      '구멍 이름은 글자 + 숫자예요. A10 = A칸의 10번 줄이에요.',
      '같은 번호 줄의 A·B·C·D·E 다섯 구멍은 속으로 이어져 있어요. F·G·H·I·J도 그래요. (그림의 노란 네모)',
      '가운데 홈을 넘어서는 안 이어져요. 그래서 건너는 선이 필요해요.',
      '전에 꽂아 둔 선과 부품은 모두 뽑아요.',
    ],
  },
  check: {
    title: '다 했어요! 마지막 점검',
    goal: 'USB를 꽂기 전에 하나씩 확인해요.',
    items: [
      '빨간 선(+)과 검은 선(−)이 같은 줄에 꽂힌 곳이 없어요.',
      'LED 두 개 모두 긴 다리가 위쪽(번호가 작은 줄)에 있어요.',
      'UNO의 0번, 1번 핀은 비어 있어요.',
      '온습도 센서의 S, +, − 글자를 다시 봤어요.',
      '이제 USB를 꽂아요. 뜨거운 부품이 있으면 바로 빼요.',
    ],
  },
};

// 단계 묶음을 그리기용 목록으로 펼칩니다.
const WIRES = [], PARTS = [];
SPEC.steps.forEach((st, g) => st.items.forEach((it, n) => {
  if (it.wire) WIRES.push({ ...it.wire, g, n });
  else PARTS.push({ ...it.part, g, n });
}));
const G = SPEC.steps.length, LAST = G + 1;

// ---------- 그리기 상수 ----------
const COLS = 'ABCDEFGHIJ', BX = 520, ROW0 = 70, RS = 24, CS = 20, GROOVE = 50;
const U = { x: 20, y: 170, w: 290, h: 190 };
const TOP = ['SCL', 'SDA', 'AREF', 'GND', '13', '12', '11', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', '0'];
const BOT = ['IOREF', 'RESET', '3V3', '5V', 'GND', 'GND', 'VIN', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
const SIG = ['#1f6fd1', '#7c4dcc', '#0f8a70', '#c0397a', '#2563a8', '#8a6a12'];
const C5V = '#d33b2c', CGND = '#26302c', NOW = '#e8730c', MARK = '#f2b600';
const INK = '#1f2a26', SUB = '#56635d';

const hx = c => { const i = COLS.indexOf(c); return i < 5 ? BX + i * CS : BX + 4 * CS + GROOVE + (i - 5) * CS; };
const hp = h => ({ x: hx(h[0]), y: ROW0 + parseInt(h.slice(1), 10) * RS, L: COLS.indexOf(h[0]) < 5 });
function pin(name) {
  const n = name.replace(/^D/, '');
  const i = TOP.indexOf(n);
  if (/^\d+$/.test(n) && i >= 0) return { x: 82 + i * 12, y: U.y + 14, top: true };
  return { x: 130 + BOT.indexOf(name) * 13, y: U.y + U.h - 14, top: false };
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const poly = (pts, color, w, halo) => {
  const d = pts.map(p => p.join(',')).join(' ');
  return `<polyline points="${d}" fill="none" stroke="${halo}" stroke-width="${w + (halo === NOW ? 5 : 3)}" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
};
const badge = (x, y, n) => `<circle cx="${x}" cy="${y}" r="9" fill="#ffffff" stroke="${NOW}" stroke-width="2.5"/><text x="${x}" y="${y + 4}" font-size="11" font-weight="700" text-anchor="middle" fill="${INK}">${n}</text>`;

// 5V는 빨강, GND는 검정, 신호선은 차례대로 다른 색입니다.
WIRES.forEach((w, i, a) => { w.color = w.role === '5v' ? C5V : w.role === 'gnd' ? CGND : SIG[a.slice(0, i).filter(x => !x.role).length % SIG.length]; });

// 미리 경로를 한 번 계산해 둡니다.
function routeAll() {
  let jl = 0; const rowStart = {};
  WIRES.forEach(c => {
    if (c.from.startsWith('UNO:')) return;
    let h1 = hp(c.from), h2 = hp(c.to);
    if (h1.L !== h2.L && h1.y === h2.y) { c.pts = [[h1.x, h1.y], [h2.x, h2.y]]; c.b = [(h1.x + h2.x) / 2, h1.y - 13]; return; }
    const key = c.from.slice(1) + (h1.L ? 'L' : 'R');
    const k = rowStart[key] = (rowStart[key] || 0) + 1;
    const dy = 2 + k * 3;
    if (h1.L && h2.L) { const lx = BX - 36 - jl++ * 6; c.pts = [[h1.x, h1.y], [h1.x, h1.y + dy], [lx, h1.y + dy], [lx, h2.y], [h2.x, h2.y]]; c.b = [lx + 14, h2.y]; }
    else if (!h1.L && !h2.L) { const rx = hx('J') + 38 + (jl++ % 6) * 6; c.pts = [[h1.x, h1.y], [h1.x, h1.y + dy], [rx, h1.y + dy], [rx, h2.y], [h2.x, h2.y]]; c.b = [rx + 14, h2.y]; }
    else {
      const fromL = h1.L; if (!h1.L) [h1, h2] = [h2, h1];
      const lx = BX - 36 - jl++ * 6, yy = h2.y - 8, d0 = fromL ? dy : 0;
      c.pts = [[h1.x, h1.y], [h1.x, h1.y + d0], [lx, h1.y + d0], [lx, yy], [h2.x, yy], [h2.x, h2.y]]; c.b = [lx + 14, yy];
    }
  });
  const laneStart = BX - 36 - jl * 6 - 10;
  const unos = WIRES.filter(c => c.from.startsWith('UNO:'));
  const byX = (a, b) => pin(b.from.slice(4)).x - pin(a.from.slice(4)).x;
  const tops = unos.filter(c => pin(c.from.slice(4)).top).sort(byX);
  const bots = unos.filter(c => !pin(c.from.slice(4)).top).sort(byX);
  const routeU = (c, stub, lane) => {
    const p = pin(c.from.slice(4)), t = hp(c.to);
    const ys = p.top ? U.y - 8 - stub * 7 : U.y + U.h + 8 + stub * 7, ty = t.L ? t.y : t.y - 8;
    c.pts = [[p.x, p.y], [p.x, ys], [lane, ys], [lane, ty], [t.x, ty]]; if (!t.L) c.pts.push([t.x, t.y]);
    c.b = [lane + 14, ty];
  };
  tops.forEach((c, i) => routeU(c, i, laneStart - (tops.length - 1 - i) * 8 - bots.length * 8));
  bots.forEach((c, i) => routeU(c, i, laneStart - (bots.length - 1 - i) * 8));
}
routeAll();

// step: 0 = 준비, 1..G = 부품 단계, LAST = 마지막 점검(전체 그림)
function render(step) {
  const cur = step >= 1 && step <= G ? step - 1 : -1;
  const upto = step === LAST ? G : cur; // 이 단계 앞까지는 흐리게
  const show = g => g < upto || g === cur;
  const dim = g => step !== LAST && g !== cur;
  const out = [];
  const bx0 = BX - 30, bx1 = hx('J') + 30, by0 = ROW0 + RS - 36, by1 = ROW0 + 30 * RS + 22;
  out.push(`<rect x="${bx0}" y="${by0}" width="${bx1 - bx0}" height="${by1 - by0}" rx="10" fill="#efece2" stroke="#cfc9b8"/>`);
  out.push(`<rect x="${hx('E') + 12}" y="${by0 + 8}" width="${GROOVE - 24}" height="${by1 - by0 - 16}" rx="4" fill="#ddd8c8"/>`);
  for (const c of COLS) out.push(`<text x="${hx(c)}" y="${ROW0 + RS - 18}" font-size="12" font-weight="700" text-anchor="middle" fill="${INK}">${c}</text>`);
  for (let r = 1; r <= 30; r++) {
    const y = ROW0 + r * RS;
    out.push(`<rect x="${hx('A') - 8}" y="${y - 7}" width="${4 * CS + 16}" height="14" rx="3" fill="#d6e8c2"/><rect x="${hx('F') - 8}" y="${y - 7}" width="${4 * CS + 16}" height="14" rx="3" fill="#d6e8c2"/>`);
    out.push(`<text x="${(hx('E') + hx('F')) / 2}" y="${y + 4}" font-size="11" font-weight="600" text-anchor="middle" fill="${INK}">${r}</text>`);
    for (const c of COLS) out.push(`<circle cx="${hx(c)}" cy="${y}" r="2.4" fill="#86928a"/>`);
  }
  // 준비 단계: 속으로 이어진 구멍 묶음 보여 주기
  if (step === 0) {
    const y = ROW0 + 5 * RS;
    out.push(`<rect x="${hx('A') - 11}" y="${y - 10}" width="${4 * CS + 22}" height="20" rx="5" fill="none" stroke="${MARK}" stroke-width="3"/>`);
    out.push(`<rect x="${hx('F') - 11}" y="${y - 10}" width="${4 * CS + 22}" height="20" rx="5" fill="none" stroke="${MARK}" stroke-width="3"/>`);
    out.push(`<text x="${hx('A') - 18}" y="${y + 4}" font-size="12" font-weight="700" text-anchor="end" fill="${INK}">A5~E5는 서로 연결</text>`);
  }

  // UNO
  out.push(`<rect x="${U.x - 12}" y="${U.y + 28}" width="44" height="40" rx="3" fill="#b9c0c4" stroke="#8d969b"/>`);
  out.push(`<rect x="${U.x - 8}" y="${U.y + U.h - 58}" width="40" height="36" rx="4" fill="#2b2b2b"/>`);
  out.push(`<rect x="${U.x}" y="${U.y}" width="${U.w}" height="${U.h}" rx="10" fill="#1d6f8f" stroke="#145570"/>`);
  out.push(`<rect x="76" y="${U.y + 8}" width="216" height="12" rx="2" fill="#1a1a1a"/><rect x="124" y="${U.y + U.h - 20}" width="168" height="12" rx="2" fill="#1a1a1a"/>`);
  out.push(`<rect x="150" y="${U.y + 95}" width="120" height="22" rx="2" fill="#1a1a1a"/>`);
  out.push(`<text x="${U.x + 70}" y="${U.y + 82}" font-size="15" font-weight="700" fill="#ffffff">UNO</text>`);
  out.push(`<text x="${U.x + 6}" y="${U.y + 48}" font-size="8" fill="#cfe6ef">USB</text>`);
  const usedPins = new Set(WIRES.filter(w => show(w.g) && w.from.startsWith('UNO:')).map(w => w.from.slice(4)));
  const curPins = new Set(WIRES.filter(w => w.g === cur && w.from.startsWith('UNO:')).map(w => w.from.slice(4)));
  const pinMark = (x, y, on, now) => `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" fill="${now ? NOW : on ? '#ffd24a' : '#666'}"/>` + (now ? `<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="${NOW}" stroke-width="2.5"/>` : '');
  const pinText = (on, now) => `fill="${now ? '#ffe08a' : on ? '#ffffff' : '#a9cbd8'}" font-size="${now ? 9 : 7}" font-weight="${on || now ? 700 : 400}"`;
  TOP.forEach((n, i) => { const x = 82 + i * 12, on = usedPins.has('D' + n), now = curPins.has('D' + n); out.push(pinMark(x, U.y + 14, on, now) + `<text transform="rotate(-90 ${x} ${U.y + 26})" x="${x}" y="${U.y + 29}" text-anchor="end" ${pinText(on, now)}>${n}</text>`); });
  BOT.forEach((n, i) => { const x = 130 + i * 13, first = BOT.indexOf(n) === i, on = first && usedPins.has(n), now = first && curPins.has(n); out.push(pinMark(x, U.y + U.h - 14, on, now) + `<text transform="rotate(-90 ${x} ${U.y + U.h - 26})" x="${x}" y="${U.y + U.h - 23}" text-anchor="start" ${pinText(on, now)}>${n}</text>`); });
  out.push(`<text x="${U.x}" y="${U.y - 86}" font-size="12" font-weight="600" fill="${INK}">위쪽 줄: 숫자 핀(4·8·10·12번)</text>`);
  out.push(`<text x="${U.x}" y="${U.y + U.h + 92}" font-size="12" font-weight="600" fill="${INK}">아래쪽 줄: 5V · GND · A4 · A5</text>`);

  // 부품과 선. 지난 단계는 흐리게, 이번 단계는 주황 테두리와 번호.
  const layer = { dim: [], now: [], badges: [] };
  PARTS.filter(p => show(p.g)).forEach(p => {
    const el = [], hs = p.holes.map(hp), a = hs[0], b = hs[hs.length - 1], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const now = p.g === cur;
    if (now) {
      const xs = hs.map(h => h.x), ys = hs.map(h => h.y);
      el.push(`<rect x="${Math.min(...xs) - 13}" y="${Math.min(...ys) - 13}" width="${Math.max(...xs) - Math.min(...xs) + 26}" height="${Math.max(...ys) - Math.min(...ys) + 26}" rx="8" fill="${NOW}" fill-opacity=".15" stroke="${NOW}" stroke-width="2.5"/>`);
    }
    if (p.type === 'R') el.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#8b6b3e" stroke-width="2"/><rect x="${mx - 7}" y="${my - 11}" width="14" height="22" rx="4" fill="#ead2a8" stroke="#9c7a4a"/><text x="${mx}" y="${my + 3}" font-size="8" text-anchor="middle" fill="${INK}">R</text>`);
    else if (p.type === 'BUZ') el.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#777" stroke-width="2"/><circle cx="${mx}" cy="${my}" r="11" fill="#2b2b2b"/><circle cx="${mx}" cy="${my}" r="3" fill="#888"/><text x="${a.x + 12}" y="${a.y - 3}" font-size="11" font-weight="700" fill="${INK}">+</text>`);
    else if (p.type === 'LED') el.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#777" stroke-width="2"/><circle cx="${mx}" cy="${my}" r="8" fill="${p.color}" stroke="${INK}" stroke-width="1"/><text x="${a.x + 9}" y="${a.y - 3}" font-size="11" font-weight="700" fill="${INK}">+</text>`);
    if (p.type === 'MOD') hs.forEach((h, i) => el.push(`<rect x="${h.x - 5}" y="${h.y - 5}" width="10" height="10" rx="1.5" fill="${p.color}" stroke="#ffffff" stroke-width="1"/><text x="${h.x + 9}" y="${h.y - 4}" font-size="9.5" font-weight="700" fill="${INK}">${esc(p.pins[i])}</text>`));
    else hs.forEach(h => el.push(`<circle cx="${h.x}" cy="${h.y}" r="3" fill="#2f3a35"/>`));
    (dim(p.g) ? layer.dim : layer.now).push(...el);
    if (now) {
      // 저항·LED·부저는 가운데 홈에, 모듈은 첫 구멍 위에 번호를 둡니다.
      const at = p.type === 'MOD' ? [a.x, a.y - 15] : [(hx('E') + hx('F')) / 2, my];
      layer.badges.push(badge(at[0], at[1], p.n + 1));
    }
  });
  WIRES.filter(w => show(w.g)).forEach(w => {
    const now = w.g === cur, el = [poly(w.pts, w.color, now ? 4 : 3, now ? NOW : '#fbfcf8')];
    [w.to].concat(w.from.startsWith('UNO:') ? [] : [w.from]).forEach(h => { const q = hp(h); el.push(`<circle cx="${q.x}" cy="${q.y}" r="${now ? 4.5 : 3.2}" fill="${w.color}" stroke="#fff" stroke-width="1"/>`); });
    (dim(w.g) ? layer.dim : layer.now).push(...el);
    if (now) layer.badges.push(badge(w.b[0], w.b[1], w.n + 1));
  });
  out.push(`<g opacity=".3">${layer.dim.join('')}</g>`, ...layer.now, ...layer.badges);

  const W = hx('J') + 110, H = by1 + 50;
  out.push(`<text x="20" y="${by1 + 6}" font-size="12" font-weight="600" fill="${INK}">빨간 선 = + (5V) · 검은 선 = − (GND)</text>`);
  out.push(`<text x="20" y="${by1 + 26}" font-size="12" font-weight="600" fill="${INK}">주황 동그라미 번호 = 오른쪽 할 일 번호 · 흐린 것 = 이미 끝낸 단계</text>`);
  const head = `<text x="20" y="30" font-size="17" font-weight="700" fill="${INK}">${esc(SPEC.title)}</text><text x="20" y="50" font-size="12" fill="${SUB}">USB를 뺀 상태에서 꽂아요</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="wd-title wd-desc"><title id="wd-title">${esc(SPEC.title)} 빵판 배선도</title><desc id="wd-desc">${esc(stepInfo(step).title)}. 같은 내용이 오른쪽 할 일 목록에 글로 있습니다.</desc><rect width="${W}" height="${H}" fill="#fbfcf8"/>${head}${out.join('')}</svg>`;
}

// ---------- 단계 설명 ----------
function stepInfo(step) {
  if (step === 0) return { ...SPEC.ready, kicker: `준비 · 0 / ${LAST}`, items: SPEC.ready.items.map(say => ({ say })) };
  if (step === LAST) return { kicker: `점검 · ${LAST} / ${LAST}`, title: SPEC.check.title, goal: SPEC.check.goal, items: SPEC.check.items.map(say => ({ say })) };
  const st = SPEC.steps[step - 1];
  return { kicker: `${step}단계 / ${LAST}`, title: st.name, goal: st.goal, items: st.items, tips: st.tips || [] };
}

// ---------- 화면 연결 ----------
const $ = s => document.querySelector(s);
let step = 0;
let done = new Set();
try { const saved = Number(localStorage.getItem('pl3-wiring-step')); if (Number.isInteger(saved) && saved >= 0 && saved <= LAST) step = saved; } catch (e) {}
try { done = new Set(JSON.parse(localStorage.getItem('pl3-wiring-done') || '[]')); } catch (e) {}
// wiring.html#step-3 처럼 특정 단계를 바로 엽니다.
const hashStep = location.hash.match(/^#step-(\d+)$/);
if (hashStep) step = Math.min(LAST, Number(hashStep[1]));

function update(announce) {
  $('#wiring-sheet').innerHTML = render(step);
  const t = stepInfo(step);
  $('#step-kicker').textContent = t.kicker;
  $('#step-title').textContent = t.title;
  $('#step-goal').textContent = t.goal;
  $('#step-body').innerHTML = t.items.map((it, i) => {
    const key = `${step}-${i}`;
    return `<li><label class="check"><input type="checkbox" data-key="${key}"${done.has(key) ? ' checked' : ''}><span class="num" aria-hidden="true">${i + 1}</span><span>${esc(it.say)}</span></label></li>`;
  }).join('');
  $('#step-tips').innerHTML = (t.tips || []).map(s => `<p class="step-tip"><strong>주의</strong> ${esc(s)}</p>`).join('');
  $('#prev-btn').disabled = step === 0;
  $('#next-btn').disabled = step === LAST;
  $('#step-select').value = String(step);
  $('#progress').value = step;
  document.querySelectorAll('#all-table tbody tr').forEach(tr => {
    const on = Number(tr.dataset.step) === step;
    tr.classList.toggle('current', on);
    if (on) tr.setAttribute('aria-current', 'step'); else tr.removeAttribute('aria-current');
  });
  if (announce) $('#step-live').textContent = `${t.kicker}. ${t.title}`;
  try { localStorage.setItem('pl3-wiring-step', String(step)); } catch (e) {}
}
function go(n) { step = Math.max(0, Math.min(LAST, n)); update(true); }

// 단계 선택 목록, 준비물, 한눈에 보기 표
const sel = $('#step-select');
sel.innerHTML = `<option value="0">0 · 준비</option>` +
  SPEC.steps.map((st, i) => `<option value="${i + 1}">${i + 1} · ${esc(st.name)}</option>`).join('') +
  `<option value="${LAST}">${LAST} · 마지막 점검</option>`;
$('#progress').max = LAST;
$('#all-table tbody').innerHTML = SPEC.steps.map((st, g) => st.items.map((it, i) =>
  `<tr data-step="${g + 1}">${i === 0 ? `<th scope="rowgroup" rowspan="${st.items.length}">${g + 1}. ${esc(st.name)}</th>` : ''}<td>${i + 1}</td><td>${esc(it.say)}</td></tr>`).join('')).join('');
const wireCount = WIRES.length, modPins = PARTS.filter(p => p.type === 'MOD').reduce((t, p) => t + p.holes.length, 0);
$('#part-list').innerHTML = [
  '저항(1kΩ) 3개', '빨강 LED 1개', '초록 LED 1개', '부저(수동형) 1개', '온습도 센서 DHT11 1개', 'LCD 화면(I2C) 1개',
  `수–수 선 ${wireCount}개`, `암–수 선 ${modPins}개`,
].map(s => `<li>${esc(s)}</li>`).join('');

$('#prev-btn').addEventListener('click', () => go(step - 1));
$('#next-btn').addEventListener('click', () => go(step + 1));
$('#first-btn').addEventListener('click', () => go(0));
sel.addEventListener('change', () => go(Number(sel.value)));
$('#step-body').addEventListener('change', (e) => {
  const key = e.target.dataset.key; if (!key) return;
  if (e.target.checked) done.add(key); else done.delete(key);
  try { localStorage.setItem('pl3-wiring-done', JSON.stringify([...done])); } catch (err) {}
});
$('#reset-btn').addEventListener('click', () => {
  done.clear();
  try { localStorage.removeItem('pl3-wiring-done'); } catch (e) {}
  go(0);
});
// 그림 영역에 초점이 있을 때 ←/→로 단계를 옮깁니다(버튼으로도 모두 가능).
$('#wiring-sheet').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') { e.preventDefault(); go(step + 1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); go(step - 1); }
});
update(false);
})();
