#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>

// Konfigurasi WiFi
// Ganti dengan SSID dan Password WiFi Anda
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Konfigurasi WebSocket Server (Laptop)
// Ganti dengan IP Address Laptop Anda di jaringan WiFi
const char* ws_host = "192.168.1.100";
const uint16_t ws_port = 8765;
const char* ws_url = "/esp";

WebSocketsClient webSocket;

// Variabel data dummy
float sine_wave = 0.0;
float cosine_wave = 0.0;
int counter = 0;

// Variabel waktu
unsigned long lastDataTime = 0;
const unsigned long dataInterval = 10; // 10ms = 100Hz sample rate

// Fungsi callback event WebSocket
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.printf("[WSc] Disconnected!\n");
            break;
        case WStype_CONNECTED:
            Serial.printf("[WSc] Connected to url: %s\n", payload);
            // Kirim Header saat pertama kali terhubung
            webSocket.sendTXT("HEADER:millis,sine_wave,cosine_wave,counter");
            break;
        case WStype_TEXT:
            // Proses command dari server (jika ada)
            // Command yang diterima adalah <string> tanpa awalan CMD:
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

        // Cek jika terhubung ke websocket
        if (webSocket.isConnected()) {
            // Update dummy data
            sine_wave = sin(currentMillis / 1000.0) * 100.0;
            cosine_wave = cos(currentMillis / 1000.0) * 50.0;
            counter = (counter + 1) % 100;

            // Format data CSV: millisValue,value1,value2,valueN
            String data = String(currentMillis) + "," +
                          String(sine_wave, 2) + "," +
                          String(cosine_wave, 2) + "," +
                          String(counter);

            // Kirim data frame
            webSocket.sendTXT(data);
        }
    }
}
