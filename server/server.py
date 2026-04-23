import asyncio
import websockets
import time
import os
import datetime

# Menyimpan koneksi client
esp_client = None
ui_clients = set()

# Konfigurasi batching
BATCH_INTERVAL = 0.25  # 250 ms
data_batch = []
last_batch_time = time.time()

# Konfigurasi recording
is_recording = False
record_file = None
record_filename = ""
csv_header = ""

async def handle_esp(websocket):
    global esp_client, data_batch, csv_header, is_recording, record_file

    print("[Server] ESP32 Connected")
    esp_client = websocket

    try:
        async for message in websocket:
            # Periksa apakah ini header
            if message.startswith("HEADER:"):
                csv_header = message[7:] # Hilangkan awalan "HEADER:"
                print(f"[Server] Received Header: {csv_header}")

                # Teruskan header ke semua UI client
                header_msg = f"HEADER:{csv_header}"
                if ui_clients:
                    websockets.broadcast(ui_clients, header_msg)
            else:
                # Ini adalah data frame (CSV)
                data_batch.append(message)

                # Tulis ke file jika sedang merekam
                if is_recording and record_file is not None:
                    try:
                        record_file.write(message + "\n")
                        record_file.flush() # Pastikan data tersimpan
                    except Exception as e:
                        print(f"[Server] Error writing to file: {e}")

    except websockets.exceptions.ConnectionClosed as e:
        print(f"[Server] ESP32 Disconnected: {e}")
    finally:
        esp_client = None

async def handle_ui(websocket):
    global ui_clients, is_recording, record_file, record_filename, csv_header

    print("[Server] UI Client Connected")
    ui_clients.add(websocket)

    # Kirim header terakhir jika ada (supaya UI baru tahu formatnya)
    if csv_header:
        try:
            await websocket.send(f"HEADER:{csv_header}")
        except:
            pass

    # Kirim status rekaman saat ini
    status_msg = f"STATUS:REC_{'START' if is_recording else 'STOP'}"
    try:
        await websocket.send(status_msg)
    except:
        pass

    try:
        async for message in websocket:
            print(f"[Server] Received from UI: {message}")

            if message.startswith("CMD:"):
                cmd = message[4:] # Hilangkan awalan "CMD:"
                print(f"[Server] Forwarding Command to ESP32: {cmd}")

                if esp_client:
                    try:
                        await esp_client.send(cmd)
                    except Exception as e:
                        print(f"[Server] Error sending cmd to ESP32: {e}")
                else:
                    print("[Server] Cannot send command, ESP32 not connected")

            elif message == "REC:start":
                if not is_recording:
                    # Buat file baru
                    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                    record_filename = f"telemetry_{timestamp}.csv"
                    try:
                        record_file = open(record_filename, 'w')
                        if csv_header:
                            record_file.write(csv_header + "\n")
                        is_recording = True
                        print(f"[Server] Recording started: {record_filename}")
                        # Broadcast status ke semua UI
                        websockets.broadcast(ui_clients, "STATUS:REC_START")
                    except Exception as e:
                        print(f"[Server] Failed to start recording: {e}")

            elif message == "REC:stop":
                if is_recording:
                    is_recording = False
                    if record_file:
                        try:
                            record_file.close()
                        except Exception as e:
                            print(f"[Server] Error closing file: {e}")
                        record_file = None
                    print(f"[Server] Recording stopped. File saved as {record_filename}")
                    # Broadcast status ke semua UI
                    websockets.broadcast(ui_clients, "STATUS:REC_STOP")

    except websockets.exceptions.ConnectionClosed as e:
        print(f"[Server] UI Client Disconnected: {e}")
    finally:
        ui_clients.remove(websocket)

async def batch_sender():
    """Task yang berjalan periodik untuk mengirim batch data ke UI"""
    global data_batch, last_batch_time, ui_clients

    while True:
        current_time = time.time()

        # Kirim jika interval tercapai dan ada data
        if current_time - last_batch_time >= BATCH_INTERVAL:
            if data_batch and ui_clients:
                # Gabungkan data dengan newline sebagai pemisah batch
                batch_msg = "BATCH:" + "\n".join(data_batch)

                # Gunakan broadcast untuk efisiensi
                try:
                    websockets.broadcast(ui_clients, batch_msg)
                except Exception as e:
                    print(f"[Server] Error broadcasting batch: {e}")

                # Kosongkan batch
                data_batch.clear()
            elif data_batch:
                # Jika tidak ada UI, kosongkan saja agar memori tidak penuh
                data_batch.clear()

            last_batch_time = current_time

        # Tidur sebentar agar CPU tidak 100%
        await asyncio.sleep(0.01)

async def router(websocket):
    """Mengarahkan koneksi berdasarkan path"""
    req_path = websocket.request.path

    if req_path == '/esp':
        await handle_esp(websocket)
    elif req_path == '/ui':
        await handle_ui(websocket)
    else:
        print(f"[Server] Invalid path connection attempt: {req_path}")
        await websocket.close()

async def main():
    # Mulai task untuk mengirim batch data periodik
    asyncio.create_task(batch_sender())

    # Jalankan server
    print("[Server] Starting WebSocket server on 0.0.0.0:8765")
    print("[Server] Paths available: /esp (for ESP32) and /ui (for Dashboard)")
    async with websockets.serve(router, "0.0.0.0", 8765):
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Server] Shutting down...")
        if is_recording and record_file:
            record_file.close()
