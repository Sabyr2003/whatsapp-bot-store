// npm run start-full

require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { transcribeAudioLocally } = require('./modules/transcriber');
const { getAIResponse } = require('./modules/aiResponder');
const { calculateDistanceKm } = require('./modules/deliveryCalculator');
const { getSession, updateSession, clearSession, appendHistory } = require('./modules/sessionManager');
const { getAllProducts, saveOrder, getScrewdriversFromDB } = require('./modules/supabase');

// Запуск клиента WhatsApp
const client = new Client({ authStrategy: new LocalAuth() });

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ Бот полностью готов к работе!'));

// Главный обработчик сообщений
client.on('message', async msg => {
  const sitePhrases = ['через сайт', 'оплата на сайте', 'сайт', 'оплата онлайн', 'через интернет', 'оплачиваю на сайте'];
  if (sitePhrases.some(p => msg.body.toLowerCase().includes(p))) {
    await msg.reply('🔗 Конечно! Перейдите на наш сайт для оплаты: https://sabyrshop.freesite.online/');
    return;
  }
  console.log("➡ Пришло сообщение:", msg.type);

  if (msg.fromMe) return;

  const session = getSession(msg.from);

  // === Обработка аудио сообщений ===
  if (msg.hasMedia && ['audio', 'voice', 'ptt'].includes(msg.type)) {
    const media = await msg.downloadMedia();
    const buffer = Buffer.from(media.data, 'base64');
    const tempFileName = `temp_${Date.now()}.ogg`;
    const audioPath = path.join(__dirname, tempFileName);
    fs.writeFileSync(audioPath, buffer);

    try {
      const text = await transcribeAudioLocally(audioPath);
      console.log('🎤 Распознанный текст:', text);
      appendHistory(msg.from, 'user', text); // добавляем в историю

      const aiResponse = await getAIResponse(text, msg.from);
      console.log('🤖 AI ответ:', aiResponse);

      appendHistory(msg.from, 'assistant', aiResponse.text); // добавляем в историю

      await msg.reply(`🎧 Вы сказали: "${text}"\n\n🤖 ${aiResponse.text}`);

      if (aiResponse?.recommendedProduct) {
        updateSession(msg.from, { recommendedProduct: aiResponse.recommendedProduct });
      }
    } catch (err) {
      console.error('Ошибка распознавания голоса:', err.message);
      await msg.reply('❌ Ошибка при обработке голосового сообщения.');
    } finally {
      fs.unlinkSync(audioPath);
    }
    return;
  }

  // === Работаем с текстовыми сообщениями ===
  const text = msg.body.trim().toLowerCase();
  appendHistory(msg.from, 'user', text);  // сохраняем в историю

  // Сброс сессии
  if (text === 'сброс' || text === 'отмена') {
    clearSession(msg.from);
    await msg.reply('🗑️ Сессия полностью очищена.');
    return;
  }

  // Обработка стандартных вопросов через intents
  if (await handleIntentsSmart(text, msg, session)) {
    return;
  }

  // === Выбор товара по номеру ===
  if (/^\d+$/.test(text) && session.productOptions?.length) {
    const index = parseInt(text) - 1;
    if (index >= 0 && index < session.productOptions.length) {
      const selected = session.productOptions[index];
      updateSession(msg.from, { selectedProduct: selected, state: 'awaiting_order_confirmation' });
      await msg.reply(`✅ Вы выбрали: ${selected.name} (${selected.price}₸).\nОписание: ${selected.description}\nХотите оформить заказ?`);
    } else {
      await msg.reply(`❌ Введите корректный номер товара от 1 до ${session.productOptions.length}.`);
    }
    return;
  }

  // === Умная автообработка после AI-рекомендаций ===
  if (
    ['да', 'хочу', 'оформить', 'давай', 'закажем', 'хочу его'].some(word => text.includes(word)) &&
    !session.selectedProduct &&
    session.recommendedProduct
  ) {
    updateSession(msg.from, { selectedProduct: session.recommendedProduct, state: 'awaiting_address' });
    await msg.reply(`✅ Оформляем заказ на: ${session.recommendedProduct.name} (${session.recommendedProduct.price}₸).\nУкажите адрес доставки:`);
    return;
  }

  // === Подтверждение оформления заказа ===
  if (session.state === 'awaiting_order_confirmation' && ['да', 'хочу', 'оформить', 'давай'].some(word => text.includes(word))) {
    if (session.selectedProduct) {
      updateSession(msg.from, { state: 'awaiting_address' });
      await msg.reply(`✅ Отлично! Укажите, пожалуйста, адрес для доставки вашего товара: ${session.selectedProduct.name}`);
    } else {
      await msg.reply('❗ Уточните, какой товар вы хотите заказать.');
    }
    return;
  }

  // === Ввод адреса доставки ===
  if (session.state === 'awaiting_address') {
    const address = msg.body.trim();
    try {
      const { km, price } = await calculateDistanceKm(address);
      const success = await saveOrder(msg.from, session.selectedProduct, address, price);
      if (success) {
        updateSession(msg.from, { state: 'awaiting_payment_method' });

        const productPrice = session.selectedProduct.price || 0;
        const totalPrice = productPrice + price;

        await msg.reply(
          `🧾 Заказ успешно оформлен!\n` +
          `📍 Адрес доставки: ${address}\n` +
          `📦 Товар: ${session.selectedProduct.name} (${productPrice}₸)\n` +
          `🚚 Доставка: ${price}₸ (~${km} км)\n` +
          `💵 Итоговая стоимость: ${totalPrice}₸\n\n` +
          `💳 Выберите способ оплаты:\n` +
          `- Kaspi\n` +
          `- Картой (онлайн через сайт: https://sabyrshop.freesite.online/)\n` +
          `- Наличными\n` +
          `- В рассрочку`
        );
      } else {
        await msg.reply('❌ Не удалось сохранить заказ. Попробуйте снова.');
      }
    } catch (err) {
      await msg.reply('❌ Ошибка при расчёте доставки. Убедитесь, что адрес указан корректно.');
      console.error('Ошибка при расчёте доставки:', err.message);
    }
    return;
  }


  // === Выбор способа оплаты ===
  if (session.state === 'awaiting_payment_method') {
    const kaspiVariants = ['kaspi', 'каспи'];
    const cashVariants = ['налич', 'нал'];
    const cardVariants = ['карт', 'карта', 'visa', 'mastercard', 'через сайт', 'оплата на сайте', 'онлайн', 'сайт'];
    const creditVariants = ['рассрочка', 'в рассрочку'];
    const includesAny = variants => variants.some(word => text.includes(word));

    if (includesAny(kaspiVariants)) {
      await msg.reply('✅ Оплата через Kaspi: переведите на +7 XXX XXX XXXX и отправьте скрин оплаты.');
      clearSession(msg.from);
      return;
    }
    if (includesAny(cashVariants)) {
      await msg.reply('✅ Оплата наличными при получении. Благодарим за заказ!');
      clearSession(msg.from);
      return;
    }
    if (includesAny(cardVariants)) {
      await msg.reply('✅ Вы можете оплатить заказ онлайн выбрав товар на нашем сайте: https://sabyrshop.freesite.online/');
      clearSession(msg.from);
      return;
    }
    if (includesAny(creditVariants)) {
      await msg.reply('💬 Для оформления рассрочки, пожалуйста, отправьте ФИО и ИИН.');
      updateSession(msg.from, { state: 'awaiting_credit_info' });
      return;
    }
    await msg.reply('❗ Пожалуйста, выберите корректный способ оплаты: Kaspi, картой, наличными или рассрочка.');
    return;
  }


  // === Отдельная обработка шуруповёртов ===
  if (text.includes('шуруповерт') || text.includes('шуруповёрт')) {
    const screwdriverOptions = await getScrewdriversFromDB();
    if (screwdriverOptions.length === 0) {
      await msg.reply('❌ Шуруповёрты не найдены.');
      return;
    }
    updateSession(msg.from, { productOptions: screwdriverOptions });
    const list = screwdriverOptions.map((p, i) => `${i + 1}. 🔹 ${p.name} - ${p.price}₸`).join('\n');
    await msg.reply(`Доступные шуруповёрты:\n\n${list}\n\nНапишите номер выбранного.`);
    return;
  }

  // === Финальный вызов основного AI (если ничего не сработало) ===
  const aiResponse = await getAIResponse(msg.body, msg.from);
  await msg.reply(aiResponse.text);
  appendHistory(msg.from, 'assistant', aiResponse.text);
  if (aiResponse?.recommendedProduct) {
    updateSession(msg.from, { recommendedProduct: aiResponse.recommendedProduct });
  }
});

client.initialize();

// ===================== Интенты ==========================

const intents = {
  order: ['оформить заказ', 'хочу заказать', 'заказываю', 'покупка', 'давайте оформим'],
  specs: ['характеристики', 'мощность', 'оборотов', 'крутящий момент', 'сетевой', 'аккумуляторный', 'заряд'],
  price: ['цена', 'сколько стоит', 'сколько обойдется', 'скидки', 'стоимость'],
  delivery: ['доставка', 'самовывоз', 'куда доставляете', 'доставите', 'забрать'],
  payment: ['оплата', 'оплатить', 'каспи', 'карта', 'рассрочка'],
  greet: ['привет', 'здравствуйте', 'помощь', 'порекомендуйте', 'работаете', 'консультация'],
  address: ['где вы', 'адрес', 'реквизиты', 'склад', 'посмотреть']
};

async function handleIntentsSmart(text, msg, session) {
  for (const group in intents) {
    for (const phrase of intents[group]) {
      if (text.includes(phrase)) {
        switch (group) {
          case 'order':
            await msg.reply('✅ Конечно! Напишите, какой товар вас интересует, и мы оформим заказ.');
            return true;
          case 'specs':
            await msg.reply('🔧 Уточните модель товара, и я расскажу о характеристиках.');
            return true;
          case 'price':
            await msg.reply('💰 Цены зависят от модели. Напишите название товара или выберите из списка.');
            return true;
          case 'delivery':
            await msg.reply('🚚 Доставка по Алматы — 500₸ + 200₸ за км, по РК — Казпочта 2500₸.');
            return true;
          case 'payment':
            await msg.reply('💳 Мы принимаем: Kaspi, картой, наличными, рассрочка.');
            return true;
          case 'greet':
            await msg.reply('👋 Добро пожаловать! Я помогу вам выбрать и оформить заказ.');
            return true;
          case 'address':
            await msg.reply('📍 Наш склад: Алматы, проспект Райымбека, 373.');
            return true;
        }
      }
    }
  }
  return false;
}
