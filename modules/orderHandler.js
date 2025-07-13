const { getAllProducts, saveOrder } = require('./supabase');
const { calculateDistanceKm } = require('./deliveryCalculator');
const { getSession, updateSession, clearSession } = require('./sessionManager');

// 🧠 Обработка логики заказа
async function handleOrderFlow(msg, text) {
  const session = getSession(msg.from);

  // ✅ Пользователь подтверждает заказ
  if (session.state === 'awaiting_order_confirmation' && ['да', 'хочу', 'оформить'].some(word => text.includes(word))) {
    updateSession(msg.from, { state: 'awaiting_address' });
    return `✅ Вы выбрали: ${session.selectedProduct.name} (${session.selectedProduct.price}₸).\nУкажите, пожалуйста, адрес для доставки.`;
  }

  // 🚚 Пользователь вводит адрес
  if (session.state === 'awaiting_address') {
    const address = msg.body.trim();
    try {
      const { km, price } = await calculateDistanceKm(address);
      const success = await saveOrder(msg.from, session.selectedProduct, address, price);

      if (success) {
        clearSession(msg.from);
        return `🧾 Заказ оформлен!\n📍 Адрес: ${address}\n🚚 Доставка: ${price}₸ (~${km} км)\n📦 Товар: ${session.selectedProduct.name} (${session.selectedProduct.price}₸)`;
      } else {
        return '❌ Не удалось сохранить заказ. Попробуйте позже.';
      }
    } catch (err) {
      if (err.message.includes('Адрес не найден')) {
        return '❌ Не удалось найти адрес. Убедитесь, что он указан правильно.';
      } else {
        console.error('Ошибка при расчете доставки:', err.message);
        return '❌ Ошибка при расчёте доставки. Попробуйте позже.';
      }
    }
  }

  // 🧲 Попытка найти товар по тексту (автораспознавание)
  const products = await getAllProducts();
  const found = products.find(p => text.includes(p.name.toLowerCase()));

  if (found) {
    updateSession(msg.from, {
      selectedProduct: found,
      state: 'awaiting_order_confirmation'
    });

    return `🔍 Найдено: ${found.name} (${found.price}₸).\nОписание: ${found.description}\nХотите оформить заказ?`;
  }

  return null; // если заказ не обрабатывается — вернуть null
}

module.exports = { handleOrderFlow };
