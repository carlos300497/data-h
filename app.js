const broker = 'wss://broker.emqx.io:8084/mqtt';
const client = new Paho.Client(broker, "clientId-" + Math.floor(Math.random() * 10000));

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

// Mapa de nombres del CSV a tópicos MQTT
const csvToTopicMap = {
    humedad_arandano: "sensor/humedad/arandano",
    temperatura_tablero: "sensor/temperatura/tablero",
    temperatura_raspberry: "sensor/temperatura/rasberry",
    frecuencia: "inomax/frecuencia",
    activacion: "inomax/activacion",
    control: "inomax/control",
    estado_variador: "inomax/estadoVariador",
    temperatura_variador: "inomax/temperaturaVariador",
    torque: "inomax/torque",
    bus_de_voltaje: "inomax/busdevoltaje"
};

const chartSeriesMap = {};

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

    return chart.addLineSeries({ color: lineColor, lineWidth: 2 });
}

function updateLightweightChart(series, value) {
    const now = new Date();
    const timestamp = Math.floor(now.getTime() / 1000) - (5 * 3600); // GMT-5
    series.update({ time: timestamp, value });
}

// Leer y cargar datos desde CSV con downsampling
async function loadCSVData() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/carlos300497/data-h/main/lecturas.csv');
        const text = await response.text();
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());

        console.log("📄 Encabezados del CSV:", headers);

        const step = 50;

        for (let i = 1; i < lines.length; i += step) {
            const row = lines[i].split(',');
            const time = parseInt(row[0]);

            for (let j = 1; j < headers.length; j++) {
                const csvKey = headers[j];
                const topic = csvToTopicMap[csvKey];

                if (!topic) {
                    console.warn(`⚠️ Columna ignorada: '${csvKey}' no está en csvToTopicMap`);
                    continue;
                }

                const value = parseFloat(row[j]);
                const series = chartSeriesMap[topic];

                if (series && !isNaN(value)) {
                    series.update({ time, value });
                    console.log(`🟢 CSV → ${topic}: ${value} @ ${new Date(time * 1000).toLocaleString()}`);
                } else {
                    console.warn(`⚠️ No se pudo graficar: topic=${topic}, value=${value}, series=${!!series}`);
                }
            }
        }

        console.log("✅ Datos históricos cargados correctamente.");
    } catch (error) {
        console.error("❌ Error al cargar el CSV:", error);
    }
}

// Manejo de MQTT
client.onMessageArrived = function (message) {
    const topic = message.destinationName;
    const value = parseFloat(message.payloadString.replace(/\[|\]|"/g, ""));

    const grafico = graficos.find(g => g.topic === topic);
    if (grafico && chartSeriesMap[topic]) {
        updateLightweightChart(chartSeriesMap[topic], value);
        const label = document.getElementById(grafico.labelId);
        if (label) label.innerText = value;
    } else {
        console.warn(`⚠️ Tópico desconocido o gráfico no inicializado: ${topic}`);
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

// Inicializar gráficos y cargar CSV al inicio
window.onload = () => {
    graficos.forEach(g => {
        const series = createLightweightChart(g.id, g.color);
        chartSeriesMap[g.topic] = series;
    });

    loadCSVData(); // Cargar datos históricos desde CSV
};
