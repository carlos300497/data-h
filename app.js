const CSV_URL = "https://raw.githubusercontent.com/carlos300497/data-h/main/lecturas.csv";
const broker = 'wss://broker.emqx.io:8084/mqtt';

const client = new Paho.Client(broker, "clientId-" + Math.floor(Math.random() * 10000));

// Configuración de todos los gráficos
const graficos = [
    { id: "humedadArandanoChart", topic: "sensor/humedad/arandano", color: "#3498DB", labelId: "humedadArandano" },
    { id: "temperaturaTableroChart", topic: "sensor/temperatura/tablero", color: "#E74C3C", labelId: "temperaturaTablero" },
    { id: "temperaturaRaspberryChart", topic: "sensor/temperatura/rasberry", color: "#2ECC71", labelId: "temperaturaRaspberry" },
    { id: "frecuenciaChart", topic: "inomax/frecuencia", color: "#36A2EB", labelId: "frecuencia" },
    { id: "activacionChart", topic: "inomax/activacion", color: "#FF6384", labelId: "activacion" },
    { id: "controlChart", topic: "inomax/control", color: "#FFA500", labelId: "control" },
    { id: "estadoVariadorChart", topic: "inomax/estadoVariador", color: "#FFCD56", labelId: "estadoVariador" },
    { id: "temperaturaVariadorChart", topic: "inomax/temperaturaVariador", color: "#4BC0C0", labelId: "temperaturaVariador" },
    { id: "torqueChart", topic: "inomax/torque", color: "#9966FF", labelId: "torque" },
    { id: "busdevoltajeChart", topic: "inomax/busdevoltaje", color: "#FF8C00", labelId: "busdevoltaje" }
];

const chartSeriesMap = {}; // Almacena series por tópico

function createLightweightChart(containerId, lineColor) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: 300,
        layout: {
            backgroundColor: '#ffffff',
            textColor: '#000',
        },
        grid: {
            vertLines: { color: '#e1e1e1' },
            horzLines: { color: '#e1e1e1' },
        },
        timeScale: {
            timeVisible: true,
            secondsVisible: false,
        },
    });

    return chart.addLineSeries({
        color: lineColor,
        lineWidth: 2,
    });
}

function updateLightweightChart(series, value) {
    const now = new Date();
    const timestamp = Math.floor(now.getTime() / 1000) - (5 * 3600);
    series.update({ time: timestamp, value });
}

client.onMessageArrived = function (message) {
    const topic = message.destinationName;
    const value = parseFloat(message.payloadString.replace(/\[|\]|"/g, ""));

    const grafico = graficos.find(g => g.topic === topic);
    if (grafico) {
        updateLightweightChart(chartSeriesMap[topic], value);
        const label = document.getElementById(grafico.labelId);
        if (label) label.innerText = value;
    } else {
        console.warn(`⚠️ Tópico desconocido: ${topic}`);
    }
};

client.onConnectionLost = function (responseObject) {
    if (responseObject.errorCode !== 0) {
        console.log(`⚠️ Desconexión de MQTT: ${responseObject.errorMessage}`);
    }
};

function onConnect() {
    console.log("✅ Conectado al broker MQTT");

    graficos.forEach(g => {
        client.subscribe(g.topic, {
            onSuccess: () => console.log(`✅ Suscrito a: ${g.topic}`),
            onFailure: (err) => console.error(`❌ Error al suscribirse a ${g.topic}:`, err.errorMessage)
        });
    });
}

function onFailure(response) {
    console.error("❌ Error de conexión:", response.errorMessage);
}

client.connect({ onSuccess: onConnect, onFailure });

function downsampleData(data, intervalInSeconds = 1800) {
    if (data.length === 0) return [];

    const result = [];
    let bucket = [];
    let startTime = data[0].time;

    for (const point of data) {
        if (point.time - startTime < intervalInSeconds) {
            bucket.push(point.value);
        } else {
            if (bucket.length > 0) {
                const avg = bucket.reduce((sum, v) => sum + v, 0) / bucket.length;
                result.push({ time: startTime, value: avg });
            }
            startTime = point.time;
            bucket = [point.value];
        }
    }

    // Último bloque
    if (bucket.length > 0) {
        const avg = bucket.reduce((sum, v) => sum + v, 0) / bucket.length;
        result.push({ time: startTime, value: avg });
    }

    return result;
}
async function loadDataFromCSV(series, topic) {
    try {
        const response = await fetch(CSV_URL);
        const csvText = await response.text();
        const rows = csvText.trim().split('\n').slice(1);

        const data = [];

        for (let row of rows) {
            const [id, csvTopic, valueStr, timeStr] = row.split(',');
            if (csvTopic.trim() !== topic) continue;

            const value = parseFloat(valueStr);
            if (isNaN(value)) {
                console.warn(`❌ Valor inválido para topic "${csvTopic}":`, valueStr);
                continue;
            }

            const date = new Date(timeStr);
            const timestamp = Math.floor(date.getTime() / 1000) - (5 * 3600);
            if (isNaN(timestamp)) continue;

            data.push({ time: timestamp, value });
        }

        // 👉 Reducir datos para evitar sobrecarga en el gráfico
        const dataReducida = downsampleData(data, 600); // cada 30 minutos (1800s)
        series.setData(dataReducida);
        console.log(`📉 Histórico con downsampling cargado para ${topic} (${dataReducida.length} puntos)`);

    } catch (error) {
        console.error(`❌ Error al cargar CSV (${topic}):`, error.message);
    }
}

// ✅ Al cargar la página
window.onload = () => {
    graficos.forEach(g => {
        const series = createLightweightChart(g.id, g.color);
        chartSeriesMap[g.topic] = series;
        loadDataFromCSV(series, g.topic);
    });
};
