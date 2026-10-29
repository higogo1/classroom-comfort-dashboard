// PL3: 교실 쾌적도. 온도·습도가 정한 범위를 벗어나면 빨강 LED가 깜박이고 부저가 울리며 LCD에 경고가 나옵니다.
// 같은 폴더의 pins.h가 배선표와 동일한 핀을 지정하고, protocol.h는 강의 P01의 규약을 그대로 씁니다.
#include "pins.h"
#include <DHT.h>
#include <Wire.h>
#include <hd44780.h>
#include <hd44780ioClass/hd44780_I2Cexp.h>
#include "protocol.h"
DHT dht(PIN_DHT, DHT11);
hd44780_I2Cexp lcd;

// signal: 0=꺼짐, 1=빨강, 2=초록
byte signalState=0;
bool automatic=false, dhtValid=false, lcdReady=false, buzzerEnabled=true, blinkOn=false;
float temperature=0, humidity=0, discomfort=0;
// 범위 판정: 0=적정, 1=낮음, 2=높음. 기본값은 학교보건법 시행규칙의 교실 기준(18~28°C, 30~80%)입니다.
int tempLow=18, tempHigh=28, humLow=30, humHigh=80;
byte tempState=0, humState=0, okReadings=0;
bool alarm=false;            // 범위를 벗어남. 다시 적정이 3번(약 6초) 연속 읽혀야 풀립니다.
char message[17]="";         // 사용자 문구. 경보 중에는 경보 문구가 우선합니다.
char alertText[17]="";
unsigned long lastDht=0, lastDisplay=0, lastState=0;

const char *const STATE_NAMES[]={"\"ok\"","\"low\"","\"high\""};
byte rangeState(float value, int low, int high) { return value<low ? 1 : value>high ? 2 : 0; }
// 깜박임·부저·LCD 경보는 자동 판정이 켜져 있을 때만 동작합니다.
bool alarmActive() { return automatic && alarm; }

void writeLamp() {
  bool red=false, green=false;
  if(automatic) {
    if(alarm) red=blinkOn;
    else if(dhtValid) green=true;   // 측정 전이나 실패하면 판단하지 않고 둘 다 끕니다.
    signalState = alarm ? 1 : dhtValid ? 2 : 0;
  } else { red=signalState==1; green=signalState==2; }
  digitalWrite(PIN_RED, red?HIGH:LOW);
  digitalWrite(PIN_GREEN, green?HIGH:LOW);
}
void safeStop() { automatic=false; signalState=0; noTone(PIN_BUZZER); writeLamp(); }
void printJsonText(const char *text) {
  Serial.print('"');
  for(const char *c=text; *c; c++) { if(*c=='"'||*c=='\\') Serial.print('\\'); Serial.print(*c); }
  Serial.print('"');
}
void snapshot(unsigned int request) {
  stateStart(request);
  Serial.print(F(",\"temperature_c\":")); if(dhtValid) Serial.print(temperature,1); else Serial.print(F("null"));
  Serial.print(F(",\"humidity_pct\":")); if(dhtValid) Serial.print(humidity,1); else Serial.print(F("null"));
  Serial.print(F(",\"discomfort_index\":")); if(dhtValid) Serial.print(discomfort,1); else Serial.print(F("null"));
  Serial.print(F(",\"temp_state\":")); if(dhtValid) Serial.print(STATE_NAMES[tempState]); else Serial.print(F("null"));
  Serial.print(F(",\"hum_state\":")); if(dhtValid) Serial.print(STATE_NAMES[humState]); else Serial.print(F("null"));
  Serial.print(F(",\"alarm\":")); Serial.print(alarm?F("true"):F("false"));
  Serial.print(F(",\"signal\":")); Serial.print(signalState);
  Serial.print(F(",\"blinking\":")); Serial.print(alarmActive()?F("true"):F("false"));
  Serial.print(F(",\"auto\":")); Serial.print(automatic?F("true"):F("false"));
  Serial.print(F(",\"buzzer_enabled\":")); Serial.print(buzzerEnabled?F("true"):F("false"));
  Serial.print(F(",\"buzzing\":")); Serial.print(alarmActive()&&buzzerEnabled?F("true"):F("false"));
  Serial.print(F(",\"temp_range\":[")); Serial.print(tempLow); Serial.print(','); Serial.print(tempHigh); Serial.print(']');
  Serial.print(F(",\"hum_range\":[")); Serial.print(humLow); Serial.print(','); Serial.print(humHigh); Serial.print(']');
  Serial.print(F(",\"lcd_ready\":")); Serial.print(lcdReady?F("true"):F("false"));
  Serial.print(F(",\"lcd_message\":")); printJsonText(message);
  Serial.print(F(",\"lcd_alert\":")); printJsonText(alarmActive()?alertText:"");
  Serial.println('}');
}
bool printable(const char *text) {
  if(strlen(text)>16) return false;
  for(const char *c=text; *c; c++) if(*c<0x20||*c>0x7E) return false;
  return true;
}
bool pairCommand(char *args, long low, long high, int &a, int &b) {
  long limits[2];
  if(!integers(args,2,low,high,limits) || limits[0]>=limits[1]) return false;
  a=limits[0]; b=limits[1]; return true;
}
bool command(unsigned int request, const char *name, char *args) {
  long value;
  if (!strcmp(name,"SIGNAL") && integer(args,0,2,value)) {
    automatic=false; noTone(PIN_BUZZER); signalState=value; writeLamp(); applied(request); return true;
  }
  if (!strcmp(name,"AUTO") && integer(args,0,1,value)) {
    automatic=value; if(!automatic) noTone(PIN_BUZZER); writeLamp(); applied(request); return true;
  }
  if (!strcmp(name,"BUZZ") && integer(args,0,1,value)) {
    buzzerEnabled=value; if(!buzzerEnabled) noTone(PIN_BUZZER); applied(request); return true;
  }
  // 배선 확인용 짧은 소리. 음소거(BUZZ 0) 중에도 울립니다.
  if (!strcmp(name,"BEEP") && !*args) { tone(PIN_BUZZER,2000,200); applied(request); return true; }
  // 범위를 바꾸면 다음 loop에서 바로 다시 판정합니다.
  if (!strcmp(name,"TEMP") && pairCommand(args,0,50,tempLow,tempHigh)) { lastDht=0; applied(request); return true; }
  if (!strcmp(name,"HUM") && pairCommand(args,0,100,humLow,humHigh)) { lastDht=0; applied(request); return true; }
  // MSG 뒤의 글자(공백 포함)를 LCD 둘째 줄에 표시합니다. 인수 없이 보내면 지웁니다.
  if (!strcmp(name,"MSG") && printable(args)) {
    strcpy(message,args); lastDisplay=0; applied(request); return true;
  }
  errorReply(request,F("unsupported_or_range")); return false;
}
void readDht() {
  humidity=dht.readHumidity(); temperature=dht.readTemperature();
  dhtValid=!isnan(humidity)&&!isnan(temperature);
  if(!dhtValid) return;   // 실패하면 경보 상태를 그대로 두고 판단을 미룹니다.
  discomfort=0.81*temperature+0.01*humidity*(0.99*temperature-14.3)+46.3;
  tempState=rangeState(temperature,tempLow,tempHigh);
  humState=rangeState(humidity,humLow,humHigh);
  if(tempState||humState) { alarm=true; okReadings=0; }
  else if(alarm && ++okReadings>=3) { alarm=false; okReadings=0; }
  // 경보 문구는 LCD 16칸에 맞춘 영문입니다.
  char t[6];
  if(tempState) { dtostrf(temperature,4,1,t); snprintf(alertText,sizeof(alertText),"TEMP %s %sC",tempState==2?"HIGH":"LOW",t); }
  else if(humState) snprintf(alertText,sizeof(alertText),"HUMID %s %d%%",humState==2?"HIGH":"LOW",(int)humidity);
  else if(!alarm) alertText[0]='\0';
}
void drawLcd(unsigned long now) {
  char row[17];
  lcd.setCursor(0,0);
  if(dhtValid) { char t[6]; dtostrf(temperature,4,1,t); snprintf(row,sizeof(row),"T %sC  H %2d%%  ",t,(int)humidity); }
  else snprintf(row,sizeof(row),"DHT waiting     ");
  lcd.print(row);
  lcd.setCursor(0,1);
  // 온도와 습도가 모두 벗어나면 2초마다 번갈아 보여 줍니다.
  if(alarmActive() && tempState && humState && (now/2000)%2) snprintf(row,sizeof(row),"HUMID %-4s %3d%% ",humState==2?"HIGH":"LOW",(int)humidity);
  else if(alarmActive() && alertText[0]) snprintf(row,sizeof(row),"%-16s",alertText);
  else if(message[0]) snprintf(row,sizeof(row),"%-16s",message);
  else snprintf(row,sizeof(row),"SIG:%c %s BZ:%s ","-RG"[signalState],automatic?"AUT":"MAN",buzzerEnabled?"ON ":"OFF");
  lcd.print(row);
}
void setup() {
  pinMode(PIN_RED,OUTPUT); pinMode(PIN_GREEN,OUTPUT); pinMode(PIN_BUZZER,OUTPUT); safeStop();
  Serial.begin(115200); dht.begin();
  Wire.begin(); Wire.setWireTimeout(25000,true);
  lcdReady=lcd.begin(16,2)==0;
  if(lcdReady) { lcd.backlight(); lcd.print("Comfort ready"); }
  lastContact=millis();
}
void loop() {
  readCommands(); unsigned long now=millis();
  if(now-lastDht>=2000) { lastDht=now; readDht(); }
  // 0.5초마다 깜박이고, 켜지는 순간마다 짧게 삑 소리를 냅니다.
  bool phase=(now/500)%2==0;
  if(phase!=blinkOn) {
    blinkOn=phase;
    if(blinkOn && alarmActive() && buzzerEnabled) tone(PIN_BUZZER,2000,150);
  }
  writeLamp();
  if(now-lastState>=1000) { lastState=now; snapshot(0); }
  if(lcdReady && now-lastDisplay>=500) { lastDisplay=now; drawLcd(now); }
}
