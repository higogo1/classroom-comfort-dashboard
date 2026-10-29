# CLAUDE.md

교실 쾌적도: UNO(PL3 펌웨어) → `bridge/`(FastAPI, 시리얼 소유) → `dashboard/`(정적 HTML/JS, 빌드 없음). 사람이 읽는 개요와 할 일은 `README.md`.

## 사용자

비전공 수강생(K-Digital 피지컬AI 과정). 한국어로 답하고, 화면 문구도 한국어로 씁니다. 보조 개발자·컨설턴트로서 사용성과 목적을 질문하며 진행합니다. ISO 9241과 WCAG 2.2를 충족해야 합니다.

## 바꿀 때 함께 맞춰야 하는 곳

- 명령·필드: `firmware/PL3/PL3.ino` ↔ `bridge/protocol.py`(검증) ↔ `bridge/simulator.py`(가상 보드) ↔ `dashboard/app.js` ↔ 각 README. 하나만 바꾸지 않습니다.
- 핀·배선: `firmware/PL3/pins.h` ↔ `dashboard/wiring.js`의 `SPEC`. 회로가 바뀌면 회로 ID(PROFILE)도 올립니다.
- 강의 규약: 115200·LF·JSON 한 줄, `protocol.h`는 강의 P01 원본 그대로(수정 금지).

## 확인 방법

- 펌웨어: `arduino-cli compile --fqbn arduino:avr:uno --warnings all firmware/PL3`
- 브리지·대시보드: `bridge/.venv/Scripts/python.exe bridge/app.py --simulate` 실행 후 `bridge/smoke_test.py 8000`
- 실제 보드는 아직 시험하지 않았습니다. 시뮬레이터 결과를 실물 확인처럼 말하지 않습니다.

## 화면 규칙

- `null`·0·연결 끊김을 구분, 3초 넘게 값이 없으면 제어 잠금, 명령 자동 재전송 금지.
- 상태는 색만으로 표시하지 않음(모양+글자), 대비 4.5:1 이상, 대상 24px 이상, 끌기 없는 대안, 경고는 바뀔 때만 aria-live.
- 디자인: OpenDesign 소셜 대시보드 풍(어두운 유리 패널, 노랑 강조). 색은 `dashboard/styles.css`의 토큰만 사용.

## git

홈 폴더(`C:\Users\sejin`) 전체가 저장소입니다. 이 폴더에서 커밋하지 말고, 사용자가 원하면 이 폴더에 별도 저장소를 만든 뒤 커밋합니다.
