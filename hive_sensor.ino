/*
  SQIS Hive Sensor Firmware
  ─────────────────────────
  Hardware:
    - Piezoelectric sensor  → Analog pin A0  (+ GND)
    - DS18B20 temp sensor   → Digital pin 2  (+ 4.7kΩ to 5V)

  Output: JSON lines over Serial at 9600 baud
    {"temp":34.5,"freq":213.4}

  Libraries needed (install via Arduino IDE Library Manager):
    - OneWire  by Paul Stoffregen
    - DallasTemperature  by Miles Burton
*/

#include <OneWire.h>
#include <DallasTemperature.h>

// ── Pin config ──────────────────────────────
#define TEMP_PIN      2       // DS18B20 data pin
#define PIEZO_PIN     A0      // Piezoelectric analog input

// ── Sampling config ─────────────────────────
#define SAMPLE_COUNT  512     // number of ADC samples per reading
#define SAMPLE_RATE   2000    // samples per second (2 kHz)
// Detectable frequency range: 1 Hz to SAMPLE_RATE/2 = 1000 Hz
// Bee buzzing: ~200 Hz (calm) to ~750 Hz (stressed) — well within range

// ── Send interval ───────────────────────────
#define SEND_INTERVAL_MS 5000 // send a reading every 5 seconds

OneWire oneWire(TEMP_PIN);
DallasTemperature sensors(&oneWire);

void setup() {
  Serial.begin(9600);
  sensors.begin();
  delay(500);
}

void loop() {
  // 1. Read temperature
  sensors.requestTemperatures();
  float temp = sensors.getTempCByIndex(0);

  // 2. Sample piezo signal
  int samples[SAMPLE_COUNT];
  for (int i = 0; i < SAMPLE_COUNT; i++) {
    samples[i] = analogRead(PIEZO_PIN);
    delayMicroseconds(1000000 / SAMPLE_RATE);
  }

  // 3. Estimate dominant frequency via zero-crossing count
  //    (simple and reliable for a single dominant tone like buzzing)
  int midpoint = 512;  // ADC midpoint (0-1023 range)
  int crossings = 0;
  for (int i = 1; i < SAMPLE_COUNT; i++) {
    if (samples[i - 1] < midpoint && samples[i] >= midpoint) {
      crossings++;
    }
  }
  float duration_s = (float)SAMPLE_COUNT / (float)SAMPLE_RATE;
  float frequency = (float)crossings / duration_s;

  // 4. Send JSON over serial
  Serial.print("{\"temp\":");
  Serial.print(temp, 2);
  Serial.print(",\"freq\":");
  Serial.print(frequency, 1);
  Serial.println("}");

  delay(SEND_INTERVAL_MS);
}
