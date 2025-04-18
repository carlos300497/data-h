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
const chartDataMap = {}; // Almacena los datos de cada gráfico por tópico

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

function updateLightweightChart(series, value, topic) {
    const now = new Date();
    const timestamp = Math.floor(now.getTime() / 1000) - (5 * 3600);

    // Verificar si la serie existe antes de actualizar
    if (!series) {
        console.warn(`⚠️ La serie para el tópico "${topic}" no está inicializada.`);
        return;
    }

    // Actualizar la serie del gráfico
    series.update({ time: timestamp, value });

    // Almacenar los datos en chartDataMap
    if (!chartDataMap[topic]) {
        chartDataMap[topic] = [];
    }
    chartDataMap[topic].push({ time: timestamp, value });
}

client.onMessageArrived = function (message) {
    const topic = message.destinationName;
    const value = parseFloat(message.payloadString.replace(/\[|\]|"/g, ""));

    const grafico = graficos.find(g => g.topic === topic);
    if (grafico) {
        const series = chartSeriesMap[topic];
        updateLightweightChart(series, value, topic);
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

        // Reducir datos para evitar sobrecarga en el gráfico
        const dataReducida = downsampleData(data, 500); // cada 30 minutos (1800s)

        // Combinar datos históricos con datos en tiempo real
        const realtimeData = chartDataMap[topic] || [];
        const combinedData = [...dataReducida, ...realtimeData];

        // Establecer los datos combinados en la serie
        series.setData(combinedData);

        // Almacenar los datos combinados en chartDataMap
        chartDataMap[topic] = combinedData;

        console.log(`📉 Histórico y datos en tiempo real cargados para ${topic} (${combinedData.length} puntos)`);

    } catch (error) {
        console.error(`❌ Error al cargar CSV (${topic}):`, error.message);
    }
}

function expandCard(card) {
    const expandedContainer = document.getElementById("expandedCardContainer");
    const expandedContent = document.getElementById("expandedCardContent");

    if (!expandedContainer || !expandedContent) {
        console.error("❌ Contenedor de tarjeta ampliada no encontrado.");
        return;
    }

    // Copiar el contenido de la tarjeta seleccionada
    expandedContent.innerHTML = card.innerHTML;

    // Obtener el ID del gráfico y el tópico asociado
    const chartId = card.querySelector(".chart").id;
    const grafico = graficos.find(g => g.id === chartId);

    if (grafico) {
        // Crear un nuevo gráfico en el contenedor ampliado
        const expandedChartContainer = expandedContent.querySelector(".chart");
        expandedChartContainer.innerHTML = ""; // Limpiar el contenedor

        // Asegurar que el contenedor tenga dimensiones válidas
        expandedChartContainer.style.width = "100%";
        expandedChartContainer.style.height = "100%";

        const expandedChart = LightweightCharts.createChart(expandedChartContainer, {
            width: expandedChartContainer.clientWidth || expandedChartContainer.offsetWidth,
            height: expandedChartContainer.clientHeight || expandedChartContainer.offsetHeight,
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

        const expandedSeries = expandedChart.addLineSeries({
            color: grafico.color,
            lineWidth: 2,
        });

        // Transferir los datos combinados al gráfico ampliado
        const data = chartDataMap[grafico.topic];
        if (data) {
            expandedSeries.setData(data);
        } else {
            console.warn(`⚠️ No se encontraron datos para el gráfico con tópico: ${grafico.topic}`);
        }

        // Redibujar el gráfico al ajustar el tamaño
        setTimeout(() => {
            expandedChart.resize(expandedChartContainer.clientWidth, expandedChartContainer.clientHeight);
        }, 100);
    } else {
        console.warn(`⚠️ No se encontró configuración para el gráfico con ID: ${chartId}`);
    }

    // Mostrar el contenedor ampliado
    expandedContainer.classList.remove("hidden");
}

function closeExpandedCard() {
    const expandedContainer = document.getElementById("expandedCardContainer");
    if (expandedContainer) {
        expandedContainer.classList.add("hidden");
    }
}

// ✅ Al cargar la página
window.onload = () => {
    graficos.forEach(g => {
        const series = createLightweightChart(g.id, g.color);
        if (series) {
            chartSeriesMap[g.topic] = series; // Registrar la serie en el mapa
            chartDataMap[g.topic] = []; // Inicializar el almacenamiento de datos
            loadDataFromCSV(series, g.topic); // Cargar datos históricos
        } else {
            console.warn(`⚠️ No se pudo crear la serie para el gráfico con ID: ${g.id}`);
        }
    });
};
