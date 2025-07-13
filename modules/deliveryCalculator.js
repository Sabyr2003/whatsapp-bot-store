const axios = require('axios');

const BASE_PRICE = 500;
const PER_KM_PRICE = 200;
const ORIGIN = 'Алматы, проспект Райымбека, 206к';
const USER_AGENT = 'whatsapp-delivery-bot/1.0';

const coordCache = {};
let cachedOriginCoords = null;

function normalizeVariants(address) {
  let input = address
    .trim()
    .toLowerCase()
    .replace(/^до\s+|^на\s+|^в\s+|^по\s+|^к\s+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\bпроспекта\b|\bпроспекту\b/gi, 'проспект')
    .replace(/\bулицы\b|\bулице\b/gi, 'улица')
    .replace(/\bул\.?\b/gi, 'улица')
    .replace(/\bпросп\.?\b/gi, 'проспект');

  if (!input.includes('алматы')) {
    input = 'алматы, ' + input;
  }

  const variants = new Set();
  variants.add(input);

  // Вариант с латиницей (на случай если OSM не распознает кириллицу)
  variants.add(input.replace('алматы', 'almaty'));

  const match = input.match(/([а-яa-zё\-]+)\s*(\d{1,4})$/i);
  if (match) {
    const name = match[1];
    const number = match[2];

    variants.add(`алматы, проспект ${name} ${number}`);
    variants.add(`алматы, улица ${name} ${number}`);
    variants.add(`алматы, ${name} ${number}`);
  }

  return [...variants].slice(0, 5); // Ограничим до 5 попыток
}

async function getCoords(address, allowOutside = false) {
  const variants = normalizeVariants(address);

  for (const fullAddress of variants) {
    if (coordCache[fullAddress]) return coordCache[fullAddress];

    try {
      const res = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { q: fullAddress, format: 'json', limit: 1, addressdetails: 1 },
        headers: { 'User-Agent': USER_AGENT }
      });

      if (!res.data.length) continue;

      const data = res.data[0];
      const addr = data.address;
      const city = addr.city || addr.town || addr.village || addr.county || addr.state || addr.region;

      const isAlmaty = (
        city && city.toLowerCase().includes('алмат')
      ) || (data.display_name && data.display_name.toLowerCase().includes('алмат'));

      if (!allowOutside && !isAlmaty) continue;

      const coords = {
        lat: parseFloat(data.lat),
        lon: parseFloat(data.lon)
      };

      coordCache[fullAddress] = coords;
      return coords;

    } catch (err) {
      console.warn('⚠️ Ошибка при поиске координат:', fullAddress, err.message);
    }
  }

  const err = new Error('Адрес не найден');
  err.code = 'NOT_FOUND';
  throw err;
}

function haversineDistance(coord1, coord2) {
  const toRad = deg => deg * (Math.PI / 180);
  const R = 6371;

  const dLat = toRad(coord2.lat - coord1.lat);
  const dLon = toRad(coord2.lon - coord1.lon);
  const lat1 = toRad(coord1.lat);
  const lat2 = toRad(coord2.lat);

  const a = Math.sin(dLat / 2) ** 2 +
            Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function calculateDistanceKm(destinationAddress) {
  try {
    console.log('📦 Запрашиваем адрес:', destinationAddress);

    const toCoords = await getCoords(destinationAddress);
    if (!toCoords) {
      throw new Error('Адрес не найден');
    }

    if (!cachedOriginCoords) {
      cachedOriginCoords = await getCoords(ORIGIN, true);
      if (!cachedOriginCoords) {
        throw new Error('Не удалось получить координаты склада');
      }
    }

    console.log('📍 Координаты склада:', cachedOriginCoords);
    console.log('📍 Координаты получателя:', toCoords);

    const distance = haversineDistance(cachedOriginCoords, toCoords);
    if (!distance || isNaN(distance)) {
      throw Object.assign(new Error('Не удалось вычислить расстояние'), { code: 'INVALID_DISTANCE' });
    }

    const km = Math.ceil(distance);

    if (km === 0 && destinationAddress.trim().toLowerCase() !== ORIGIN.toLowerCase()) {
      throw Object.assign(new Error('Расстояние 0 км — возможно, ошибка в адресе'), { code: 'INVALID_DISTANCE' });
    }

    const price = BASE_PRICE + PER_KM_PRICE * km;

    console.log(`📏 Расстояние: ${km} км | 💰 Стоимость: ${price}₸`);

    return { km, price };
  } catch (err) {
    console.error('❌ Ошибка в calculateDistanceKm:', err.message);
    return { error: err.code || 'UNKNOWN', message: err.message };
  }
}

module.exports = { calculateDistanceKm, normalizeVariants };
