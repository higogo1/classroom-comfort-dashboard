#pragma once
#include <Arduino.h>
#define PROFILE_ID "PL3"
// dashboard/wiring.html 의 PL3 배선표와 같은 핀입니다.
const byte PIN_DHT = 4;      // DHT11 DATA (빵판 F14)
const byte PIN_BUZZER = 8;   // 수동 피에조 부저, 1kΩ 경유 (빵판 A14)
const byte PIN_RED = 10;     // 빨강 LED, 1kΩ 경유 (빵판 A10)
const byte PIN_GREEN = 12;   // 초록 LED, 1kΩ 경유 (빵판 A20)
const byte PIN_SDA = A4;     // LCD I2C SDA (빵판 F20)
const byte PIN_SCL = A5;     // LCD I2C SCL (빵판 F22)
// D0/D1은 USB 시리얼이므로 비웁니다. tone()은 Timer2를 써서 D3·D11의 PWM에 영향을 주므로 그 핀은 쓰지 않습니다.
