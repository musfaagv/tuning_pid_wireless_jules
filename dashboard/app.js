// --- State & Configuration ---
let ws;
let isConnected = false;
let isPaused = false;
let isRecording = false;

// Format data: data[0] = x-axis, data[1...n] = y-series
let plotData = [[], []]; // Init minimal structure
let headers = [];
let visibility = []; // Array of booleans

// Pengaturan
let windowSize = 100;
let xAxisMode = 'time'; // 'time' atau 'frame'
let frameCounter = 0;
let yScaleMode = 'auto'; // 'auto' atau 'manual'
let yMin = 0;
let yMax = 100;

// Referensi DOM
const statusEl = document.getElementById('connection-status');
const btnPause = document.getElementById('btn-pause');
const btnRecord = document.getElementById('btn-record');
const btnSendCmd = document.getElementById('btn-send-cmd');
const cmdInput = document.getElementById('cmd-input');
const xAxisModeSelect = document.getElementById('x-axis-mode');
const windowSizeInput = document.getElementById('window-size');
const scaleAutoRadio = document.getElementById('scale-auto');
const scaleManualRadio = document.getElementById('scale-manual');
const manualScaleInputs = document.getElementById('manual-scale-inputs');
const btnApplyScale = document.getElementById('btn-apply-scale');
const variablesPanel = document.getElementById('variables-panel');
const visibilityCheckboxes = document.getElementById('visibility-checkboxes');
const tableHeaderRow = document.getElementById('table-header-row');
const tableBody = document.getElementById('table-body');
const chartContainer = document.getElementById('uplot-chart');

// uPlot instance
let uplot = null;

// Warna default untuk series grafik
const colors = [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
    '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
    '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000',
    '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080'
];

// --- Inisialisasi WebSocket ---
function connectWebSocket() {
    // Asumsikan server berada di IP yang sama dengan host web
    const host = window.location.hostname || 'localhost';
    const wsUrl = `ws://${host}:8765/ui`;

    statusEl.textContent = 'Connecting...';
    statusEl.className = 'status warning';

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        isConnected = true;
        statusEl.textContent = 'Connected';
        statusEl.className = 'status connected';
        console.log("WebSocket Connected");
    };

    ws.onclose = () => {
        isConnected = false;
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'status disconnected';
        console.log("WebSocket Disconnected. Reconnecting in 3s...");
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
        console.error("WebSocket Error:", error);
    };

    ws.onmessage = (event) => {
        const msg = event.data;

        if (msg.startsWith("HEADER:")) {
            handleHeader(msg.substring(7));
        } else if (msg.startsWith("BATCH:")) {
            handleBatch(msg.substring(6));
        } else if (msg.startsWith("STATUS:")) {
            handleStatus(msg.substring(7));
        }
    };
}

// --- Handler Pesan ---

function handleHeader(headerStr) {
    console.log("Received Header:", headerStr);

    headers = headerStr.split(',');

    // Inisialisasi struktur plotData: data[0] = x, data[1..n] = y
    // Kolom pertama selalu millis (dikirim oleh ESP32)
    // Tapi data[0] di uPlot adalah sumbu X (bisa frame, bisa time)
    // Jadi jika ada N variabel, akan ada N array di plotData
    plotData = Array.from({ length: headers.length }, () => []);

    // Inisialisasi visibilitas (semua true)
    // headers[0] biasanya millis, tidak kita plot di sumbu Y
    visibility = Array(headers.length).fill(true);
    visibility[0] = false; // Jangan plot millis sebagai garis

    frameCounter = 0;

    buildVariablesUI();
    buildTableHeaders();
    initUPlot();
}

function handleBatch(batchStr) {
    if (headers.length === 0) return; // Belum terima header

    const lines = batchStr.trim().split('\n');
    let hasNewData = false;

    // Array sementara untuk data baru di batch ini
    const newRows = [];

    for (const line of lines) {
        if (!line) continue;

        const values = line.split(',');
        if (values.length !== headers.length) {
            console.warn("Data length mismatch", line);
            continue;
        }

        frameCounter++;
        hasNewData = true;

        const rowData = [];

        // Parse data
        for (let i = 0; i < headers.length; i++) {
            let val = parseFloat(values[i]);
            if (isNaN(val)) val = 0;
            rowData.push(val);

            // Masukkan ke struktur plot
            if (i === 0) {
                // Sumbu X: tergantung mode
                if (xAxisMode === 'time') {
                    // uPlot butuh unix timestamp dalam detik jika mode x adalah waktu,
                    // tapi jika kita set scale x non-time, bisa terima angka bebas
                    // Kita akan set x scale sebagai numbers biasa (waktu dalam ms)
                    plotData[0].push(val);
                } else {
                    plotData[0].push(frameCounter);
                }
            } else {
                plotData[i].push(val);
            }
        }
        newRows.push(rowData);
    }

    if (hasNewData) {
        // Potong data lama jika melebihi windowSize
        const currentLen = plotData[0].length;
        if (currentLen > windowSize) {
            const numToRemove = currentLen - windowSize;
            for (let i = 0; i < plotData.length; i++) {
                plotData[i].splice(0, numToRemove);
            }
        }

        // Update Chart jika tidak pause
        if (!isPaused && uplot) {
            uplot.setData(plotData);
        }

        // Update Table
        updateTable(newRows);
    }
}

function handleStatus(statusStr) {
    if (statusStr === "REC_START") {
        isRecording = true;
        btnRecord.textContent = "Stop Recording";
        btnRecord.className = "btn danger";
    } else if (statusStr === "REC_STOP") {
        isRecording = false;
        btnRecord.textContent = "Start Recording";
        btnRecord.className = "btn success";
    }
}

// --- UI Builders ---

function buildVariablesUI() {
    variablesPanel.style.display = 'block';
    visibilityCheckboxes.innerHTML = '';

    // Mulai dari indeks 1 karena indeks 0 adalah millis (sumbu X)
    for (let i = 1; i < headers.length; i++) {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = visibility[i];

        // Warna label sesuai warna garis grafik
        const colorSquare = document.createElement('span');
        colorSquare.style.display = 'inline-block';
        colorSquare.style.width = '12px';
        colorSquare.style.height = '12px';
        colorSquare.style.backgroundColor = colors[(i-1) % colors.length];
        colorSquare.style.marginRight = '8px';

        checkbox.addEventListener('change', (e) => {
            visibility[i] = e.target.checked;
            if (uplot) {
                uplot.setSeries(i, { show: visibility[i] });
            }
        });

        label.appendChild(checkbox);
        label.appendChild(colorSquare);
        label.appendChild(document.createTextNode(headers[i]));
        visibilityCheckboxes.appendChild(label);
    }
}

function buildTableHeaders() {
    tableHeaderRow.innerHTML = '';

    // Tambahkan kolom Frame #
    const thFrame = document.createElement('th');
    thFrame.textContent = 'Frame';
    tableHeaderRow.appendChild(thFrame);

    // Tambahkan kolom data
    for (const h of headers) {
        const th = document.createElement('th');
        th.textContent = h;
        tableHeaderRow.appendChild(th);
    }
}

function updateTable(newRows) {
    // newRows: array of array (rowData)
    // Hitung frame index berdasarkan frameCounter dan jumlah newRows
    let startFrame = frameCounter - newRows.length + 1;

    for (const row of newRows) {
        const tr = document.createElement('tr');

        // Frame cell
        const tdFrame = document.createElement('td');
        tdFrame.textContent = startFrame++;
        tr.appendChild(tdFrame);

        // Data cells
        for (const val of row) {
            const td = document.createElement('td');
            // Format number if needed
            td.textContent = Number.isInteger(val) ? val : val.toFixed(2);
            tr.appendChild(td);
        }

        tableBody.appendChild(tr);
    }

    // Batasi jumlah baris tabel (20 terakhir)
    const MAX_TABLE_ROWS = 20;
    while (tableBody.children.length > MAX_TABLE_ROWS) {
        tableBody.removeChild(tableBody.firstChild);
    }
}

// --- uPlot Setup ---

function initUPlot() {
    if (uplot) {
        uplot.destroy();
        chartContainer.innerHTML = '';
    }

    // Konfigurasi series
    const series = [
        {} // Konfigurasi sumbu X kosong
    ];

    for (let i = 1; i < headers.length; i++) {
        series.push({
            show: visibility[i],
            label: headers[i],
            stroke: colors[(i-1) % colors.length],
            width: 2,
            points: { show: true, size: 4 }
        });
    }

    // Konfigurasi skala sumbu Y
    const scales = {
        x: {
            time: false, // Kita gunakan angka biasa (ms atau frame)
        },
        y: {
            auto: yScaleMode === 'auto'
        }
    };

    if (yScaleMode === 'manual') {
        scales.y.range = [yMin, yMax];
    }

    const opts = {
        width: chartContainer.clientWidth,
        height: chartContainer.clientHeight - 40, // Kurangi untuk header grafik
        title: "",
        id: "telemetry-chart",
        class: "telemetry-chart",
        scales: scales,
        series: series,
        axes: [
            {
                grid: { show: true, stroke: "#eee", width: 1 },
                label: xAxisMode === 'time' ? "Time (ms)" : "Frame Index"
            },
            {
                grid: { show: true, stroke: "#eee", width: 1 },
            }
        ],
        cursor: {
            drag: {
                x: true,
                y: true,
                uni: 50 // drag lock radius
            }
        }
    };

    uplot = new uPlot(opts, plotData, chartContainer);
}

// Resize handler
window.addEventListener('resize', () => {
    if (uplot && chartContainer.clientWidth > 0) {
        uplot.setSize({
            width: chartContainer.clientWidth,
            height: chartContainer.clientHeight - 40
        });
    }
});

// --- Event Listeners UI ---

btnPause.addEventListener('click', () => {
    isPaused = !isPaused;
    if (isPaused) {
        btnPause.textContent = "Resume Render";
        btnPause.className = "btn warning";
    } else {
        btnPause.textContent = "Pause Render";
        btnPause.className = "btn primary";
        // Force update chart dengan data terbaru saat resume
        if (uplot) {
            uplot.setData(plotData);
        }
    }
});

btnRecord.addEventListener('click', () => {
    if (!isConnected) return;

    if (isRecording) {
        ws.send("REC:stop");
    } else {
        ws.send("REC:start");
    }
});

btnSendCmd.addEventListener('click', () => {
    if (!isConnected) return;
    const cmd = cmdInput.value.trim();
    if (cmd) {
        ws.send(`CMD:${cmd}`);
        cmdInput.value = '';
    }
});

cmdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        btnSendCmd.click();
    }
});

windowSizeInput.addEventListener('change', (e) => {
    let val = parseInt(e.target.value);
    if (isNaN(val) || val < 10) val = 10;
    if (val > 10000) val = 10000;
    windowSize = val;
    e.target.value = windowSize;
});

xAxisModeSelect.addEventListener('change', (e) => {
    xAxisMode = e.target.value;

    // Perlu reset plotData karena basis sumbu X berubah
    if (headers.length > 0) {
        plotData = Array.from({ length: headers.length }, () => []);
        if (uplot) {
            // Update label sumbu X
            initUPlot();
        }
    }
});

// Penanganan Scaling Manual / Auto
scaleAutoRadio.addEventListener('change', () => {
    manualScaleInputs.style.display = 'none';
    yScaleMode = 'auto';
    if (uplot) {
        initUPlot(); // Re-init uplot dengan setting baru
    }
});

scaleManualRadio.addEventListener('change', () => {
    manualScaleInputs.style.display = 'block';
    yScaleMode = 'manual';
    // Gunakan nilai yang ada atau set default
    yMin = parseFloat(document.getElementById('y-min').value) || 0;
    yMax = parseFloat(document.getElementById('y-max').value) || 100;
    if (uplot) {
        initUPlot();
    }
});

btnApplyScale.addEventListener('click', () => {
    const minVal = parseFloat(document.getElementById('y-min').value);
    const maxVal = parseFloat(document.getElementById('y-max').value);

    if (!isNaN(minVal) && !isNaN(maxVal) && minVal < maxVal) {
        yMin = minVal;
        yMax = maxVal;
        if (uplot) {
            initUPlot();
        }
    } else {
        alert("Invalid Min/Max values");
    }
});

// Zoom Controls
document.getElementById('btn-zoom-in').addEventListener('click', () => {
    if (!uplot) return;
    const scX = uplot.scales.x;
    const dX = scX.max - scX.min;
    uplot.setScale('x', { min: scX.min + dX/4, max: scX.max - dX/4 });
    // Pause auto-update saat zoom manual agar tidak loncat
    if (!isPaused) btnPause.click();
});

document.getElementById('btn-zoom-out').addEventListener('click', () => {
    if (!uplot) return;
    const scX = uplot.scales.x;
    const dX = scX.max - scX.min;
    uplot.setScale('x', { min: scX.min - dX/2, max: scX.max + dX/2 });
    if (!isPaused) btnPause.click();
});

document.getElementById('btn-reset-zoom').addEventListener('click', () => {
    if (!uplot) return;
    // Set uplot scales range to null untuk auto scale
    uplot.setScale('x', { min: null, max: null });
    if (yScaleMode === 'auto') {
        uplot.setScale('y', { min: null, max: null });
    } else {
        uplot.setScale('y', { min: yMin, max: yMax });
    }
});

// Mulai
connectWebSocket();
