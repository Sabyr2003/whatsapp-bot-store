const axios = require('axios');
const { getShopInfo, getAllProducts, getAllBrandsAndCategories } = require('./supabase');
const { calculateDistanceKm, normalizeVariants } = require('./deliveryCalculator');
const { getSession, updateSession } = require('./sessionManager');
const levenshtein = require('fast-levenshtein');
require('dotenv').config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

function extractAddress(message) {
  const variants = normalizeVariants(message);
  return variants.length > 0 ? variants[0] : null;
}

function containsOrderPhrase(text) {
  const orderPhrases = ['закажу', 'оформить', 'заказать', 'хочу', 'давай', 'возьми', 'второй', 'первый', '1', '2', '3', 'окей', 'да', 'ага', 'закажем'];
  return orderPhrases.some(phrase => text.toLowerCase().includes(phrase));
}

function isPossibleAddress(text) {
  return /\d{1,3}/.test(text) || /(улица|проспект|микрорайон|дом|корпус|квартал)/i.test(text);
}

async function getAIResponse(userMessage, userId = 'default') {
  try {
    const session = getSession(userId);
    const address = extractAddress(userMessage);
    const products = await getAllProducts();
    const normalizedMessage = userMessage.toLowerCase();

    const numMatch = normalizedMessage.match(/\b(\d+)\b/);
    if (numMatch) {
      const index = parseInt(numMatch[1]) - 1;
      if (products[index]) {
        updateSession(userId, { selectedProduct: products[index] });
        return {
          text: `✅ Вы выбрали: ${products[index].name} (${products[index].price}₸). Хотите оформить заказ или узнать больше?`,
          recommendedProduct: products[index]
        };
      }
    }

    if (session.selectedProduct && containsOrderPhrase(normalizedMessage) && !address) {
      return {
        text: `✅ Выбранный товар: ${session.selectedProduct.name} за ${session.selectedProduct.price}₸. Уточните, пожалуйста, адрес доставки.`,
        recommendedProduct: session.selectedProduct
      };
    }

    if (address && isPossibleAddress(normalizedMessage)) {
      const delivery = await calculateDistanceKm(address);
      if (typeof delivery.km === 'number' && typeof delivery.price === 'number') {
        const productLine = session.selectedProduct
          ? `✅ Выбранный товар: ${session.selectedProduct.name} за ${session.selectedProduct.price}₸.\n`
          : '';
        return {
          text: `${productLine}📍 Расстояние до вашего адреса: ~${delivery.km} км\n🚚 Стоимость доставки: ${delivery.price}₸ (500₸ + 200₸ × ${delivery.km} км)`,
          recommendedProduct: session.selectedProduct || null
        };
      }
    }

    const { brands, categories } = await getAllBrandsAndCategories();
    const matchedBrand = brands.find(brand => normalizedMessage.includes(brand));
    const matchedCategory = categories.find(cat => normalizedMessage.includes(cat));

    if (matchedBrand && matchedCategory) {
      const filtered = products.filter(p =>
        p.brand.toLowerCase().includes(matchedBrand) &&
        (p.category?.toLowerCase()?.includes(matchedCategory) || p.name.toLowerCase().includes(matchedCategory))
      );

      if (filtered.length > 0) {
        const productList = filtered.map((p, i) =>
          `${i + 1}) ${p.name} — ${p.description} (${p.price}₸)`
        ).join('\n');

        return {
          text: `🔍 Найдено ${filtered.length} товаров от бренда ${matchedBrand.toUpperCase()} в категории "${matchedCategory}":\n\n${productList}\n\nВы можете выбрать номер товара или уточнить, что вам нужно.`,
          recommendedProduct: null
        };
      }
    }

    const exactMatch = products.find(p => normalizedMessage.includes(p.name.toLowerCase()));
    if (exactMatch) {
      updateSession(userId, { selectedProduct: exactMatch });
      return {
        text: `🔍 Найдено: ${exactMatch.name} (${exactMatch.price}₸).\nОписание: ${exactMatch.description}.\nХотите оформить заказ?`,
        recommendedProduct: exactMatch
      };
    }

    const partialMatches = products.filter(p => {
      const terms = [p.name, p.category, p.description].map(str => str?.toLowerCase() || '');
      return terms.some(term =>
        term.includes(normalizedMessage) || normalizedMessage.includes(term)
      );
    });

    if (partialMatches.length === 1) {
      const product = partialMatches[0];
      updateSession(userId, { selectedProduct: product });
      return {
        text: `🔍 Похоже, вы имели в виду: ${product.name} (${product.price}₸).\nОписание: ${product.description}.\nХотите оформить заказ?`,
        recommendedProduct: product
      };
    }

    const fuzzyMatches = products
      .map(p => {
        const productName = p.name.toLowerCase();
        const distance = levenshtein.get(normalizedMessage, productName);
        const nameContainsWord = normalizedMessage.split(' ').some(word => productName.includes(word));
        return { product: p, distance, nameContainsWord };
      })
      .filter(item => item.distance <= 5 || item.nameContainsWord)
      .sort((a, b) => a.distance - b.distance);

    if (fuzzyMatches.length > 0) {
      const bestMatch = fuzzyMatches[0].product;
      updateSession(userId, { selectedProduct: bestMatch });
      return {
        text: `🔍 Возможно, вы имели в виду: ${bestMatch.name} (${bestMatch.price}₸).\nОписание: ${bestMatch.description}.\nХотите оформить заказ?`,
        recommendedProduct: bestMatch
      };
    }

    const aiText = await askOpenRouter(userMessage, products, session);
    const textLower = aiText.toLowerCase();
    const matchedProduct = products.find(p => textLower.includes(p.name.toLowerCase()));
    
    if (matchedProduct) {
      updateSession(userId, { selectedProduct: matchedProduct });
      return {
        text: `🔍 Найдено: ${matchedProduct.name} (${matchedProduct.price}₸).\nОписание: ${matchedProduct.description}.\nХотите оформить заказ?`,
        recommendedProduct: matchedProduct
      };
    }
    
    if (aiText && aiText.length > 10) {
      return {
        text: aiText,
        recommendedProduct: null
      };
    }
    

  } catch (error) {
    console.error('❌ Ошибка в getAIResponse:', error.message);
    return { text: 'Извините, не удалось обработать ваш запрос. Попробуйте ещё раз.', recommendedProduct: null };
  }
}

async function askOpenRouter(userMessage, products, session) {
  try {
    const shopInfo = await getShopInfo();
    const productList = products.map(p =>
      `🔹 ${p.name} — ${p.description} (Бренд: ${p.brand}, Цена: ${p.price}₸)`
    ).join('\n');

    const historyContext = session?.selectedProduct
      ? `Пользователь ранее выбрал товар: ${session.selectedProduct.name} (${session.selectedProduct.price}₸)`
      : 'Пользователь ещё не выбрал товар.';

    const messages = [
      {
        role: 'system',
        content: `Ты — ассистент интернет-магазина электроинструментов.

${historyContext}

Склад: Алматы, Райымбека 373.
Сайт: https://sabyrshop.freesite.online/

Оплата:
- Kaspi: +7 XXX XXX XXXX
- Рассрочка: попроси ФИО и ИИН
- Наличные: оплата при получении
- Карта: отправь ссылку https://sabyrshop.freesite.online/

Доставка:
- По Алматы: 500₸ + 200₸ за км
- За пределы Алматы: через Казпочту — 2500₸

Список товаров:
${productList}

Отвечай кратко. Если товар уже выбран — не переспрашивай про него снова. Если клиент подтверждает заказ — переходи к запросу адреса.`
      },
      {
        role: 'user',
        content: userMessage
      }
    ];

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-3.5-turbo',
        messages
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenRouter ошибка:', error.message);
    return '🤖 Извините, я не смог ответить на ваш запрос. Попробуйте позже.';
  }
}

module.exports = { getAIResponse };
