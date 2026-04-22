# ESP32 Telemetry Dashboard

A real-time telemetry system where an ESP32 sends sensor data over WebSockets to a Python server hosted on a laptop. The server then batches and forwards this data to a browser-based dashboard for visualization using uPlot.

## Features

- **High-frequency data logging**: ESP32 samples and sends data at ~100Hz.
- **Efficient data transport**: Data is sent as simple CSV strings. The server batches these before sending them to the UI to maintain 250ms rendering intervals.
- **Real-time visualization**: Dashboard utilizes `uPlot` for high-performance live graphing.
- **Recording**: Start and stop recording telemetry data directly into a CSV file on the laptop.
- **Two-way Communication**: Send commands from the web UI down to the ESP32.

---

## Prerequisites

- **Hardware**: ESP32 Development Board (e.g., ESP32 DevKitC V4).
- **Software**:
  - PlatformIO (for compiling/uploading ESP32 code).
  - Python 3.10+ (for the WebSocket server).
  - A modern web browser (for the dashboard).

---

## Setup & Running Instructions

### 1. Python WebSocket & HTTP Server

The laptop acts as the central hub. It runs two servers:
1. A WebSocket server on port `8765`.
2. A simple HTTP server on port `8000` to serve the dashboard UI.

**Steps:**

1. Navigate to the `server/` directory:
   ```bash
   cd server
   ```

2. Install the required Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the WebSocket server:
   ```bash
   python server.py
   ```
   *Keep this terminal open. The server will listen on `0.0.0.0:8765`.*

4. Open a **new terminal window** and start an HTTP server for the dashboard:
   ```bash
   cd dashboard
   python -m http.server 8000
   ```

### 2. Configure and Flash the ESP32

1. Open the `esp32/src/main.cpp` file.
2. Update the WiFi credentials:
   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";
   const char* password = "YOUR_WIFI_PASSWORD";
   ```
3. Update the WebSocket server IP address to match your laptop's IP address on the local network (e.g., `192.168.1.xxx`):
   ```cpp
   const char* ws_host = "YOUR_LAPTOP_IP";
   ```
4. Compile and upload the code using PlatformIO. If you have PlatformIO Core CLI installed:
   ```bash
   cd esp32
   pio run -t upload
   ```
   *(Or use the PlatformIO extension in VSCode).*

### 3. Access the Dashboard

1. Open your web browser and go to:
   `http://localhost:8000` (or `http://<YOUR_LAPTOP_IP>:8000` from another device on the network).
2. The UI will connect to the WebSocket server automatically.
3. Once the ESP32 connects to the WiFi and the WebSocket server, you will see data streaming on the graph and populating the table.

---

## Usage Guide

- **Pause/Resume Render**: Stops updating the graph to let you inspect data (data is still buffered in the background).
- **Zoom / Pan**: Drag on the graph to pan. Use the `+` and `-` buttons or the `Reset` button to manage zoom levels.
- **Start Recording**: Tells the Python server to start writing incoming data to a `.csv` file.
- **Stop Recording**: Closes the file. Files are saved in the `server/` directory with a timestamp.
- **Commands**: Type a command in the input box and click "Send". The server forwards this to the ESP32 (handled in `webSocketEvent` -> `WStype_TEXT`).
- **Settings Panel**:
  - Toggle visibility of variables.
  - Switch X-axis mode between `Time (ms)` and `Frame Index`.
  - Adjust the number of visible points on the graph window.
  - Set Y-Axis to Auto-scale or Manual bounds.

## Folder Structure

- `/esp32`: PlatformIO project containing the C++ code for the ESP32.
- `/server`: Python WebSocket server script and requirements.
- `/dashboard`: HTML, CSS, and JS files for the uPlot-based frontend.
