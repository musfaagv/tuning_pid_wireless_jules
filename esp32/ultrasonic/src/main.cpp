#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>

// Konfigurasi WiFi
// Ganti dengan SSID dan Password WiFi Anda
const char* ssid = "XxX";
const char* password = "12345678";

// Konfigurasi WebSocket Server (Laptop)
// Ganti dengan IP Address Laptop Anda di jaringan WiFi
const char* ws_host = "10.47.100.165";
const uint16_t ws_port = 8765;
const char* ws_url = "/esp";

WebSocketsClient webSocket;

// Konfigurasi Pin Sensor Ultrasonic HC-SR04
const int trigPin = 16;
const int echoPin = 17;

// Variabel untuk menyimpan data ultrasonic
float distance_cm = 0.0;

// Variabel waktu
unsigned long lastDataTime = 0;
const unsigned long dataInterval = 10; // 10ms = 100Hz sample rate (sesuai target)

// Fungsi untuk membaca jarak dari sensor HC-SR04
float readDistance() {
    // Pastikan trigger pin LOW
    digitalWrite(trigPin, LOW);
    delayMicroseconds(2);

    // Set trigger pin HIGH selama 10 mikrodetik
    digitalWrite(trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(trigPin, LOW);

    // Baca durasi pantulan pada echo pin (dalam mikrodetik)
    long duration = pulseIn(echoPin, HIGH);

    // Hitung jarak (Kecepatan suara: 343m/s -> 0.0343 cm/mikrodetik)
    // Jarak = (Waktu * Kecepatan) / 2 (karena bolak-balik)
    float distance = (duration * 0.0343) / 2.0;

    return distance;
}

// Fungsi callback event WebSocket
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.printf("[WSc] Disconnected!\n");
            break;
        case WStype_CONNECTED:
            Serial.printf("[WSc] Connected to url: %s\n", payload);
            // Kirim Header saat pertama kali terhubung
            webSocket.sendTXT("HEADER:millis,distance_cm");
            break;
        case WStype_TEXT:
            // Proses command dari server (jika ada)
            Serial.printf("[WSc] Received command: %s\n", payload);
            break;
        case WStype_BIN:
            Serial.printf("[WSc] Received binary length: %u\n", length);
            break;
        case WStype_ERROR:
        case WStype_FRAGMENT_TEXT_START:
        case WStype_FRAGMENT_BIN_START:
        case WStype_FRAGMENT:
        case WStype_FRAGMENT_FIN:
            break;
    }
}

void setup() {
    Serial.begin(115200);
    delay(1000);

    // Konfigurasi pin HC-SR04
    pinMode(trigPin, OUTPUT);
    pinMode(echoPin, INPUT);

    // Hubungkan ke WiFi
    Serial.println();
    Serial.println();
    Serial.print("Connecting to ");
    Serial.println(ssid);

    WiFi.begin(ssid, password);

    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }

    Serial.println("");
    Serial.println("WiFi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());

    // Konfigurasi WebSocket client
    webSocket.begin(ws_host, ws_port, ws_url);

    // Setup event handler
    webSocket.onEvent(webSocketEvent);

    // Gunakan auto reconnect jika koneksi putus (interval dalam ms)
    webSocket.setReconnectInterval(5000);
}

void loop() {
    // Jalankan task WebSocket
    webSocket.loop();

    unsigned long currentMillis = millis();

    // Kirim data setiap interval (100Hz)
    if (currentMillis - lastDataTime >= dataInterval) {
        lastDataTime = currentMillis;

        // Baca sensor HC-SR04
        distance_cm = readDistance();

        // Cek jika terhubung ke websocket
        if (webSocket.isConnected()) {
            // Format data CSV: millisValue,distance_cm
            String data = String(currentMillis) + "," + String(distance_cm, 2);

            // Kirim data frame
            webSocket.sendTXT(data);
        }
    }
}
