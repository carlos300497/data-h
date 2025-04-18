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

async function sendTelegramAlert(message) {
    const botToken = "YOUR_BOT_TOKEN"; // Reemplazar con el token del bot de Telegram
    const chatId = "YOUR_CHAT_ID"; // Reemplazar con el ID del chat o grupo
    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

    try {
        const response = await fetch(telegramApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
            }),
        });

        if (!response.ok) {
            console.error("❌ Error al enviar alerta a Telegram:", await response.text());
        } else {
            console.log("✅ Alerta enviada a Telegram.");
        }
    } catch (error) {
        console.error("❌ Error al conectar con Telegram:", error.message);
    }
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

        // Verificar si la humedad supera el umbral
        if (topic === "sensor/humedad/arandano" && value > 1300) {
            console.warn("⚠️ Alerta: Humedad alta detectada:", value);
            const alertMessage = `⚠️ Alerta: La humedad ha superado el límite. Valor actual: ${value}`;
            sendTelegramAlert(alertMessage); // Enviar alerta a Telegram
        }
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

async function calculateWeeklyHumidityStats() {
    try {
        const response = await fetch(CSV_URL);
        const csvText = await response.text();
        const rows = csvText.trim().split('\n').slice(1);

        let maxHumidity = Number.NEGATIVE_INFINITY;
        let minHumidity = Number.POSITIVE_INFINITY;
        let maxDate = null;
        let minDate = null;

        for (let row of rows) {
            const [id, csvTopic, valueStr, timeStr] = row.split(',');
            if (csvTopic.trim() !== "sensor/humedad/arandano") continue;

            const value = parseFloat(valueStr);
            const date = new Date(timeStr);

            if (isNaN(value) || isNaN(date.getTime())) continue;

            if (value > maxHumidity) {
                maxHumidity = value;
                maxDate = date;
            }

            if (value < minHumidity) {
                minHumidity = value;
                minDate = date;
            }
        }

        // Verificar si se encontraron valores válidos
        if (maxHumidity === Number.NEGATIVE_INFINITY || minHumidity === Number.POSITIVE_INFINITY) {
            console.warn("⚠️ No se encontraron datos válidos para calcular la humedad.");
            return;
        }

        // Mostrar los valores en el DOM
        document.getElementById("headerMaxHumedadArandano").innerText = maxHumidity.toFixed(2);
        document.getElementById("headerMinHumedadArandano").innerText = minHumidity.toFixed(2);

        // Mostrar las fechas asociadas
        const maxDateFormatted = maxDate ? maxDate.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" }) : "N/A";
        const minDateFormatted = minDate ? minDate.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" }) : "N/A";

        document.getElementById("headerMaxDate").innerText = maxDateFormatted;
        document.getElementById("headerMinDate").innerText = minDateFormatted;

    } catch (error) {
        console.error("❌ Error al calcular estadísticas de humedad:", error.message);
    }
}

async function updateWeeklyTrends() {
    const weekPicker = document.getElementById("weekPicker");
    const selectedWeek = weekPicker.value;

    if (!selectedWeek) {
        console.warn("⚠️ No se seleccionó ninguna semana.");
        return;
    }

    try {
        const response = await fetch(CSV_URL);
        const csvText = await response.text();
        const rows = csvText.trim().split('\n').slice(1);

        const startDate = new Date(selectedWeek);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);

        let maxHumidity = Number.NEGATIVE_INFINITY;
        let minHumidity = Number.POSITIVE_INFINITY;
        let maxDate = null;
        let minDate = null;

        for (let row of rows) {
            const [id, csvTopic, valueStr, timeStr] = row.split(',');
            if (csvTopic.trim() !== "sensor/humedad/arandano") continue;

            const value = parseFloat(valueStr);
            const date = new Date(timeStr);

            if (isNaN(value) || isNaN(date.getTime())) continue;

            if (date >= startDate && date <= endDate) {
                if (value > maxHumidity) {
                    maxHumidity = value;
                    maxDate = date;
                }

                if (value < minHumidity) {
                    minHumidity = value;
                    minDate = date;
                }
            }
        }

        // Verificar si se encontraron valores válidos
        if (maxHumidity === Number.NEGATIVE_INFINITY || minHumidity === Number.POSITIVE_INFINITY) {
            console.warn("⚠️ No se encontraron datos válidos para la semana seleccionada.");
            return;
        }

        // Mostrar los valores en el DOM
        document.getElementById("headerMaxHumedadArandano").innerText = maxHumidity.toFixed(2);
        document.getElementById("headerMinHumedadArandano").innerText = minHumidity.toFixed(2);

        // Mostrar las fechas asociadas
        const maxDateFormatted = maxDate ? maxDate.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" }) : "N/A";
        const minDateFormatted = minDate ? minDate.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" }) : "N/A";

        document.getElementById("headerMaxDate").innerText = maxDateFormatted;
        document.getElementById("headerMinDate").innerText = minDateFormatted;

    } catch (error) {
        console.error("❌ Error al actualizar tendencias semanales:", error.message);
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

function toggleCalendar(type) {
    const calendarContainer = document.getElementById("calendarContainer");
    calendarContainer.classList.toggle("hidden");
    calendarContainer.dataset.type = type; // Guardar si es para "max" o "min"
    renderCalendar();
}

function closeCalendar() {
    const calendarContainer = document.getElementById("calendarContainer");
    calendarContainer.classList.add("hidden");
}

let currentDate = new Date();

function renderCalendar() {
    const calendar = document.getElementById("calendar");
    const currentMonth = document.getElementById("currentMonth");
    calendar.innerHTML = ""; // Limpiar el calendario

    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    // Mostrar el mes y año actual
    currentMonth.innerText = startOfMonth.toLocaleDateString("es-ES", {
        year: "numeric",
        month: "long",
    });

    // Obtener el día de la semana del primer día del mes
    const startDay = startOfMonth.getDay();

    // Rellenar días vacíos antes del inicio del mes
    for (let i = 0; i < startDay; i++) {
        const emptyCell = document.createElement("div");
        calendar.appendChild(emptyCell);
    }

    // Rellenar los días del mes
    for (let day = 1; day <= endOfMonth.getDate(); day++) {
        const dayCell = document.createElement("div");
        dayCell.innerText = day;
        dayCell.onclick = () => selectDate(day);
        calendar.appendChild(dayCell);
    }
}

function changeMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    renderCalendar();
}

async function updateHumidityStats(startDate, endDate) {
    try {
        const response = await fetch(CSV_URL);
        const csvText = await response.text();
        const rows = csvText.trim().split('\n').slice(1);

        let maxHumidity = Number.NEGATIVE_INFINITY;
        let minHumidity = Number.POSITIVE_INFINITY;
        let maxDate = null;
        let minDate = null;

        for (let row of rows) {
            const [id, csvTopic, valueStr, timeStr] = row.split(',');
            if (csvTopic.trim() !== "sensor/humedad/arandano") continue;

            const value = parseFloat(valueStr);
            const date = new Date(timeStr);

            if (isNaN(value) || isNaN(date.getTime())) continue;

            if (date >= startDate && date <= endDate) {
                if (value > maxHumidity) {
                    maxHumidity = value;
                    maxDate = date;
                }

                if (value < minHumidity) {
                    minHumidity = value;
                    minDate = date;
                }
            }
        }

        // Verificar si se encontraron valores válidos
        if (maxHumidity === Number.NEGATIVE_INFINITY || minHumidity === Number.POSITIVE_INFINITY) {
            console.warn("⚠️ No se encontraron datos válidos para el rango seleccionado.");
            return;
        }

        const calendarType = document.getElementById("calendarContainer").dataset.type;

        if (calendarType === "max") {
            document.getElementById("headerMaxHumedadArandano").innerText = maxHumidity.toFixed(2);
            document.getElementById("headerMaxDate").innerText = maxDate.toLocaleDateString("es-ES", {
                year: "numeric",
                month: "long",
                day: "numeric",
            });
        } else if (calendarType === "min") {
            document.getElementById("headerMinHumedadArandano").innerText = minHumidity.toFixed(2);
            document.getElementById("headerMinDate").innerText = minDate.toLocaleDateString("es-ES", {
                year: "numeric",
                month: "long",
                day: "numeric",
            });
        }

        closeCalendar();
    } catch (error) {
        console.error("❌ Error al actualizar estadísticas de humedad:", error.message);
    }
}

async function updateVoltageStats(startDate, endDate) {
    try {
        const response = await fetch(CSV_URL);
        const csvText = await response.text();
        const rows = csvText.trim().split('\n').slice(1);

        let maxVoltage = Number.NEGATIVE_INFINITY;
        let minVoltage = Number.POSITIVE_INFINITY;
        let maxDate = null;
        let minDate = null;

        for (let row of rows) {
            const [id, csvTopic, valueStr, timeStr] = row.split(',');
            if (csvTopic.trim() !== "inomax/busdevoltaje") continue;

            const value = parseFloat(valueStr);
            const date = new Date(timeStr);

            if (isNaN(value) || isNaN(date.getTime())) continue;

            if (date >= startDate && date <= endDate) {
                if (value > maxVoltage) {
                    maxVoltage = value;
                    maxDate = date;
                }

                if (value < minVoltage) {
                    minVoltage = value;
                    minDate = date;
                }
            }
        }

        // Verificar si se encontraron valores válidos
        if (maxVoltage === Number.NEGATIVE_INFINITY || minVoltage === Number.POSITIVE_INFINITY) {
            console.warn("⚠️ No se encontraron datos válidos para el rango seleccionado.");
            return;
        }

        const calendarType = document.getElementById("calendarContainer").dataset.type;

        if (calendarType === "maxBus") {
            document.getElementById("headerMaxBusVoltaje").innerText = maxVoltage.toFixed(2);
            document.getElementById("headerMaxBusDate").innerText = maxDate.toLocaleDateString("es-ES", {
                year: "numeric",
                month: "long",
                day: "numeric",
            });
        } else if (calendarType === "minBus") {
            document.getElementById("headerMinBusVoltaje").innerText = minVoltage.toFixed(2);
            document.getElementById("headerMinBusDate").innerText = minDate.toLocaleDateString("es-ES", {
                year: "numeric",
                month: "long",
                day: "numeric",
            });
        }

        closeCalendar();
    } catch (error) {
        console.error("❌ Error al actualizar estadísticas de voltaje:", error.message);
    }
}

function selectDate(day) {
    const selectedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);

    // Establecer el rango de inicio y fin para el día seleccionado
    const startDate = new Date(selectedDate);
    startDate.setHours(0, 0, 0, 0); // Inicio del día
    const endDate = new Date(selectedDate);
    endDate.setHours(23, 59, 59, 999); // Fin del día

    // Actualizar las estadísticas de humedad y voltaje para el día seleccionado
    updateHumidityStats(startDate, endDate);
    updateVoltageStats(startDate, endDate);
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
    calculateWeeklyHumidityStats();
};
