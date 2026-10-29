# PL3 브리지 (PC 연결 프로그램)

보드의 COM 포트를 혼자 열고, 웹 대시보드에는 REST API와 웹소켓을 제공합니다. 강의 규약대로 한 포트는 이 프로그램만 엽니다. Arduino 시리얼 모니터와 동시에 실행하지 마세요.

```
UNO (PL3 펌웨어) ──USB 115200 JSON──▶ app.py ──HTTP / WebSocket──▶ 브라우저
```

## 설치

```powershell
py -3.14 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

강의 자료는 Python 3.12 기준입니다. 이 PC에는 3.14만 있어 3.14로 시험했습니다.

## 실행

```powershell
# 실제 보드 (포트는 arduino-cli board list 로 확인)
.\.venv\Scripts\python.exe app.py --port COM7

# 보드 없이 대시보드를 만들 때: 가상 PL3 보드
.\.venv\Scripts\python.exe app.py --simulate
```

기본 주소는 `http://127.0.0.1:8000`이며, 이 PC에서만 접속됩니다. 브라우저로 이 주소를 열면 `../dashboard`의 대시보드가 열립니다. API 문서는 `/docs`에 있습니다.

가상 보드의 값은 측정값이 아닙니다. `/api/status`와 웹소켓의 `simulated: true`로 구분되므로, 대시보드는 이 값을 보고 "시뮬레이션"을 표시해야 합니다.

## 연결 순서

1. 포트를 엽니다. 실제 보드는 열 때 재시작하므로 2초 기다린 뒤 입력 버퍼를 비웁니다.
2. `STATUS`를 보내고 `profile`이 `PL3`인지 확인합니다. 다르면 연결하지 않고 `error`에 이유를 남깁니다.
3. 연결이 끊기면 2초마다 다시 시도합니다. **예전 명령은 다시 보내지 않습니다.**

## API

| 경로 | 설명 |
|---|---|
| `GET /api/status` | 연결 상태 + 마지막 state |
| `GET /api/history?seconds=600` | 최근 state 기록 (메모리, 최대 1시간, 프로그램 종료 시 사라짐) |
| `GET /api/ports` | PC의 COM 포트 목록 |
| `POST /api/command` | `{"command":"SIGNAL","args":"3"}` 명령 한 개 전송 |
| `WS /ws` | 실시간 이벤트 |

### 상태 필드

| 필드 | 뜻 |
|---|---|
| `connected` | STATUS 확인까지 끝난 연결 |
| `simulated` | 가상 보드 여부 |
| `error` | 마지막 실패 이유. 다시 연결에 성공할 때까지 유지 |
| `last_state_age_s` | 마지막 state 이후 지난 초 |
| `stale` | 3초 넘게 state가 없음. 대시보드는 경고를 띄우고 제어를 막습니다. 출력이 꺼졌다고 추정하지 않습니다 |
| `state` | 보드가 보낸 JSON 그대로 (필드는 `firmware/PL3/README.md`) |

### 명령 결과

| `result` | HTTP | 뜻 |
|---|---|---|
| `applied` | 200 | 보드가 ack. 프로그램이 적용했다는 뜻이며 LED가 실제로 켜졌는지는 눈으로 확인 |
| `state` | 200 | STATUS 응답 |
| `invalid` | 422 | 브리지에서 막음. 보드로 보내지 않음. `code`와 한국어 `message` 포함 |
| `rejected` | 409 | 보드가 error 응답 |
| `timeout` | 503 | 2초 안에 응답 없음. **적용 여부를 알 수 없음.** 자동 재시도하지 않음 |
| `not_connected` / `link_lost` | 503 | 연결 없음 또는 전송 중 끊김 |

`invalid`의 `code`: `range`, `order`(하한 ≥ 상한), `arg_count`, `not_integer`, `too_long`, `not_ascii`, `unknown_command`, `newline`.

### 웹소켓 이벤트

| `type` | 내용 |
|---|---|
| `hello` | 접속 직후 한 번: 연결 상태 + 마지막 state |
| `state` | `{received_ms, data}` 1초마다 |
| `link` | 연결·끊김·오류 변화 |
| `command` | 누군가 보낸 명령의 결과 (여러 탭이 같은 결과를 봄) |
| `board_error` | 요청번호 없는 보드 오류 |
| `log` | JSON이 아닌 줄 (예: 9600 단품 예제가 올라간 경우) |

## 시험

브리지를 켠 상태에서 실행합니다. 출력 명령을 보내므로 LED와 부저가 동작해도 되는 때만 돌립니다.

```powershell
.\.venv\Scripts\python.exe smoke_test.py 8000
```

## 확인 기록 (2026-10-29)

| 항목 | 결과 |
|---|---|
| 가상 보드 + `smoke_test.py` (PL3) | 22개 경우 모두 통과, 웹소켓 state/command 수신, STOP 후 출력·부저 꺼짐, 소리 필드 없음 |
| 실제 포트 오류 경로 | COM5: 포트 열기 실패 메시지 표시. COM6: "STATUS 응답이 없습니다" 표시. 둘 다 블루투스 가상 포트였음 |
| 실제 UNO + PL3 | 아직 안 함 (UNO가 연결되어 있지 않음) |
