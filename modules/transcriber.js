const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

/**
 * Локальная транскрибация аудио через Flask Whisper сервер.
 * 
 * @param {string} audioPath - Путь к локальному аудио файлу.
 * @returns {Promise<string>} - Распознанный текст.
 */
async function transcribeAudioLocally(audioPath) {
  try {
    const form = new FormData();
    form.append("file", fs.createReadStream(audioPath));

    const response = await axios.post("http://127.0.0.1:5005/transcribe", form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 30000
    });

    // Проверка структуры ответа
    if (!response || !response.data || typeof response.data.text !== 'string') {
      throw new Error("Некорректный ответ от сервера транскрибации.");
    }

    console.log("✅ Whisper успешно распознал:", response.data.text);
    return response.data.text;
  } catch (error) {
    console.error("❌ Ошибка при обращении к Flask серверу:", error.message);

    if (error.response?.data) {
      console.error("Детали ответа:", error.response.data);
    }

    // Если Axios ловит сетевую ошибку
    if (error.code === 'ECONNREFUSED') {
      console.error("❌ Whisper сервер не запущен или недоступен по адресу http://127.0.0.1:5005");
    }

    throw error;
  }
}

module.exports = { transcribeAudioLocally };
