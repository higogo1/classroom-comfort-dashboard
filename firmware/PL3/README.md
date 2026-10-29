# PL3 · 교실 쾌적도 펌웨어

DHT11로 온도·습도를 읽어 적정 범위 안이면 초록 LED를 켭니다. 범위를 벗어나면(자동 판정 중) 빨강 LED가 0.5초마다 깜박이고, 부저가 짧게 울리며, LCD 둘째 줄에 `TEMP HIGH 29.0C` 같은 경고가 나옵니다. 시리얼 규약은 강의 P01과 같습니다(115200, 줄 끝 LF, 응답은 JSON 한 줄). `protocol.h`는 강의 자료의 P01 파일을 수정 없이 복사했습니다.

PL2에서 바뀐 점: 노랑 LED와 소리 감지 모듈을 뺐고, 수동 피에조 부저를 더했습니다. 회로가 달라졌으므로 회로 ID를 PL3로 바꿨습니다. 브리지는 PL2 펌웨어가 올라간 보드를 거절합니다.

배선도: 대시보드의 **배선도** 페이지(`dashboard/wiring.html`). 아직 실물에서 확인하지 않은 회로입니다.

## 핀

| 코드 이름 | UNO 핀 | 빵판 |
|---|---|---|
| PIN_DHT | D4 | F14 |
| PIN_BUZZER | D8 | A14 → 1kΩ → 부저 + (E16) |
| PIN_RED | D10 | A10 → 1kΩ → LED |
| PIN_GREEN | D12 | A20 → 1kΩ → LED |
| PIN_SDA / PIN_SCL | A4 / A5 | F20 / F22 |

D0/D1은 비웁니다. `tone()`은 Timer2를 써서 D3·D11의 PWM에 영향을 주지만, 이 회로는 그 핀을 쓰지 않습니다.

부저는 강의 K12와 같은 **수동 피에조형** 기준입니다. 전원만 넣어도 스스로 소리가 나는 능동형이거나 종류를 모르면 GPIO에 직접 연결하지 마세요.

## 업로드

라이브러리: DHT sensor library 1.4.7 / Adafruit Unified Sensor 1.1.15 / hd44780 1.3.2

```powershell
arduino-cli compile --fqbn arduino:avr:uno .
arduino-cli upload  --fqbn arduino:avr:uno -p COM7 .
```

COM7은 예시입니다. `arduino-cli board list`로 실제 포트를 확인합니다.

## 판정 규칙

- 기본 적정 범위는 학교보건법 시행규칙의 교실 기준인 **온도 18–28°C, 습도 30–80%**입니다.
- 온도나 습도 중 하나라도 범위를 벗어나면 경보(`alarm=true`)가 바로 켜집니다.
- 다시 적정 범위로 돌아와도 **3번(약 6초) 연속** 적정이어야 경보가 풀립니다. 경계에서 깜박임이 반복되지 않게 하기 위해서입니다.
- 깜박임·부저·LCD 경고는 **자동 판정(AUTO 1)일 때만** 동작합니다. 직접 지정 중에는 고른 색만 켭니다.
- DHT 첫 측정 전이나 읽기 실패 중에는 판정하지 않습니다. 자동 판정이면 두 LED를 끄고, 이미 켜진 경보는 유지합니다.
- 온도와 습도가 모두 벗어나면 LCD는 2초마다 두 경고를 번갈아 보여 줍니다.

## 명령 (PC → 보드)

| 예시 | 범위와 동작 |
|---|---|
| `1 STATUS` | 현재 상태 요청 |
| `2 PING` | 연결 확인 |
| `3 STOP` | 자동 해제, 두 LED 끄기, 부저 정지 |
| `10 SIGNAL 2` | 0=꺼짐 1=빨강 2=초록. 자동 판정 해제 |
| `11 AUTO 1` / `12 AUTO 0` | 자동 판정 켜기/끄기 |
| `13 TEMP 18 28` | 온도 하한·상한 °C. 0~50, 하한 < 상한 |
| `14 HUM 30 80` | 습도 하한·상한 %. 0~100, 하한 < 상한 |
| `15 BUZZ 0` / `16 BUZZ 1` | 경보음 끄기(음소거)/켜기. 기본은 켜짐 |
| `17 BEEP` | 0.2초 시험 소리. 음소거 중에도 울림 |
| `18 MSG Open window` | LCD 둘째 줄 문구, ASCII 16자 이하. 경보 중에는 경보 문구가 먼저. `18 MSG`만 보내면 지움 |

시작할 때는 LED가 모두 꺼지고 자동 판정도 꺼져 있습니다. 그래서 대시보드에서 `AUTO 1`을 보내기 전에는 경보가 울리지 않습니다.

## 상태 (보드 → PC, 1초마다 `request:0`)

```json
{"v":1,"type":"state","profile":"PL3","request":0,"ms":5012,"temperature_c":29.0,"humidity_pct":41.0,"discomfort_index":76.4,"temp_state":"high","hum_state":"ok","alarm":true,"signal":1,"blinking":true,"auto":true,"buzzer_enabled":true,"buzzing":true,"temp_range":[18,28],"hum_range":[30,80],"lcd_ready":true,"lcd_message":"","lcd_alert":"TEMP HIGH 29.0C"}
```

위는 형식 예시이며 실물 기록이 아닙니다.

| 필드 | 뜻 |
|---|---|
| `temperature_c`, `humidity_pct`, `discomfort_index` | DHT 첫 측정 전이나 실패하면 `null` (0이 아님). 불쾌지수는 참고값 |
| `temp_state`, `hum_state` | `"ok"` · `"low"` · `"high"`, 측정 전이면 `null` |
| `alarm` | 범위를 벗어난 상태(해제 대기 6초 포함). 직접 지정 중에도 계산됨 |
| `signal` | 0 꺼짐 · 1 빨강 · 2 초록. 깜박이는 중에도 1 |
| `blinking`, `buzzing` | 자동 판정 경보로 깜박이는 중 / 부저를 울리는 중 (프로그램 상태. 실제 소리는 직접 확인) |
| `buzzer_enabled` | 경보음 켜짐 여부 |
| `lcd_alert` | LCD에 표시 중인 경보 문구. 경보가 아니면 빈 문자열 |

## 시험 순서

USB를 뺀 상태에서 배선표와 대조하고, 업로드한 뒤 시리얼 모니터를 **115200 · 새 줄**로 설정합니다.

| 구분 | 보낼 것 / 할 것 | 기대 결과 |
|---|---|---|
| 정상 | `1 STATUS` | `profile:"PL3"`가 담긴 state |
| 정상 | `2 SIGNAL 1`, `3 SIGNAL 2`, `4 SIGNAL 0` | 빨강 → 초록 → 모두 꺼짐(눈으로 확인) |
| 정상 | `5 BEEP` | 짧은 삑 소리 |
| 정상 | `6 AUTO 1` | 실내가 범위 안이면 초록 |
| 정상 | `7 TEMP 10 15` (현재 온도보다 낮은 상한) | 2초 안에 빨강 깜박임, 부저 삑삑, LCD `TEMP HIGH ..C` |
| 정상 | `8 BUZZ 0` | 깜박임은 계속, 소리만 멈춤 |
| 정상 | `9 TEMP 18 28` | 약 6초 뒤 초록, LCD 경고 사라짐 |
| 경계 | `10 TEMP 28 18`, `11 HUM 30`, `12 SIGNAL 3` | 각각 `error`·`unsupported_or_range` |
| 경계 | `13 MSG 가나다` 또는 17자 문구 | `error` |
| 실패 | DHT DATA선을 USB 분리 후 빼고 다시 연결 | 온습도 `null`, 자동 판정이면 두 LED 꺼짐 |
| 실패 | LCD 선을 뺀 채 시작 | `lcd_ready:false`, 나머지 동작 |

## 확인 기록

| 항목 | 상태 |
|---|---|
| 컴파일 (arduino:avr 1.8.8) | 성공. 플래시 58%, SRAM 45% (남은 1121바이트) |
| 업로드 | 아직 안 함 |
| 실제 동작 | 아직 안 함 |

## 알려진 제약

- DHT11 오차(±2°C, ±5%) 때문에 경계값 근처에서는 판정이 바뀔 수 있습니다. 6초 해제 대기로 깜박임 반복을 줄입니다.
- 부저 음량은 1kΩ 제한 저항 때문에 작을 수 있습니다. 저항을 줄이기 전에 부저 정격을 확인하세요.
