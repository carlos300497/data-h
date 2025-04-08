async function loadDataFromCSV(series, topic) {
    try {
        const response = await fetch(CSV_URL);
        const csvText = await response.text();
        const rows = csvText.trim().split('\n').slice(1);

        const data = [];

        for (let row of rows) {
            const [id, csvTopic, valorStr, timeStr] = row.split(',');
            if (csvTopic.trim() !== topic) continue;

            const value = parseFloat(valorStr);
            if (isNaN(value)) continue; // ❌ Evita valores no numéricos

            const date = new Date(timeStr);
            if (isNaN(date.getTime())) continue; // ❌ Evita fechas inválidas

            const timestamp = Math.floor(date.getTime() / 1000) - (5 * 3600);
            data.push({ time: timestamp, value });
        }

        data.sort((a, b) => a.time - b.time);

        // ✅ Solo carga si hay datos válidos
        if (data.length > 0) {
            series.setData(data);
            console.log(`📊 Cargado histórico para ${topic}`);
        } else {
            console.warn(`⚠️ No hay datos válidos para ${topic}`);
        }
    } catch (error) {
        console.error(`❌ Error al cargar CSV (${topic}):`, error.message);
    }
}
