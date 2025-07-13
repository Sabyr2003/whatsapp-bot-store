const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function getShopInfo() {
  const { data, error } = await supabase
    .from('shop_info')
    .select('info')
    .eq('id', 1)
    .single();

  if (error) {
    console.error('Ошибка получения описания магазина:', error.message);
    return 'Информация недоступна.';
  }

  return data.info;
}

async function getAllProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, brand, price, description, category');

  if (error) {
    console.error('Ошибка получения товаров:', error.message);
    return [];
  }

  return data.map(product => ({
    ...product,
    description: product.description || 'Описание отсутствует.'
  }));
}

// 👉 Получение всех уникальных брендов и категорий
async function getAllBrandsAndCategories() {
  const { data, error } = await supabase.from('products').select('brand, category');
  if (error) {
    console.error('Ошибка получения брендов и категорий:', error.message);
    return { brands: [], categories: [] };
  }

  const brands = [...new Set(data.map(p => p.brand?.toLowerCase()).filter(Boolean))];
  const categories = [...new Set(data.map(p => p.category?.toLowerCase()).filter(Boolean))];

  return { brands, categories };
}

// 🛒 Сохранение заказа в таблицу orders
async function saveOrder(userId, product, address, deliveryPrice) {
  const { error } = await supabase.from('orders').insert([{
    user_id: userId,
    product_id: product.id,
    product_name: product.name,
    product_price: product.price,
    address,
    delivery_price: deliveryPrice,
    created_at: new Date().toISOString()
  }]);

  if (error) {
    console.error('❌ Ошибка сохранения заказа:', error.message);
    return false;
  }

  return true;
}
// 🔍 Получение всех шуруповёртов из базы
async function getScrewdriversFromDB() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, brand, price, description, category');

  if (error) {
    console.error('Ошибка получения шуруповёртов:', error.message);
    return [];
  }

  const screwdrivers = data.filter(p =>
    (p.name + p.description).toLowerCase().includes('шуруповерт') ||
    (p.name + p.description).toLowerCase().includes('шуруповёрт')
  );

  return screwdrivers.map(product => ({
    ...product,
    description: product.description || 'Описание отсутствует.'
  }));
}



module.exports = {
  getShopInfo,
  getAllProducts,
  getAllBrandsAndCategories,
  saveOrder,
  getScrewdriversFromDB
};

