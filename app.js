const broker = 'wss://broker.emqx.io:8084/mqtt';
const client = new Paho.Client(broker, "clientId-" + Math.floor(Math.random() * 10000));

// Configuración de los gráficos y tópicos MQTT
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

const chartSeriesMap = {}; // Relación tópico -> gráfico

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
    const timestamp = Math.floor(now.getTime() / 1000) - (5 * 3600); // Ajuste GMT-5
    series.update({ time: timestamp, value });
}

// Manejo de mensajes entrantes desde MQTT
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

// Al cargar la página, inicializar los gráficos (sin cargar CSV)
window.onload = () => {
    graficos.forEach(g => {
        const series = createLightweightChart(g.id, g.color);
        chartSeriesMap[g.topic] = series;
    });
};
