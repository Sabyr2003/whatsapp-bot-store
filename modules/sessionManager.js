const sessions = new Map();

/**
 * Получает сессию пользователя. Если сессии нет — создаёт новую.
 */
function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      state: null,
      selectedProduct: null,
      productOptions: [],
      recommendedProduct: null,
      history: []  // 👈 добавляем хранение истории сообщений
    });
  }
  return sessions.get(userId);
}

/**
 * Обновляет сессию пользователя, объединяя данные.
 */
function updateSession(userId, data) {
  const session = getSession(userId);
  sessions.set(userId, { ...session, ...data });
}

/**
 * Добавляет новое сообщение в историю.
 */
function appendHistory(userId, role, content) {
  const session = getSession(userId);
  if (!session.history) session.history = [];
  session.history.push({ role, content });

  // Ограничим историю до 15 сообщений, чтобы не перегружать OpenAI
  if (session.history.length > 15) {
    session.history.shift();
  }
}

/**
 * Очищает сессию пользователя.
 */
function clearSession(userId) {
  sessions.delete(userId);
}

/**
 * Получает выбранный товар пользователя.
 */
function getSelectedProduct(userId) {
  const session = getSession(userId);
  return session.selectedProduct || null;
}

/**
 * Получает список предложенных товаров.
 */
function getProductOptions(userId) {
  const session = getSession(userId);
  return session.productOptions || [];
}

module.exports = {
  getSession,
  updateSession,
  clearSession,
  getSelectedProduct,
  getProductOptions,
  appendHistory  // 👈 обязательно экспортируем новый метод
};
