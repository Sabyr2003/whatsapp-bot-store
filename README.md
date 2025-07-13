# 🤖 WhatsApp Бот для интернет-магазина на JavaScript

Бот разработан для автоматизации общения с клиентами в WhatsApp. Он отвечает на вопросы, предлагает товары, рассчитывает доставку и подключается к AI-ассистенту (GPT). Бот также сохраняет информацию о заказах в базе данных.

---

## 📦 Функциональность

- 🔹 Обработка заказов и сообщений
- 🔹 Предложение списка товаров
- 🔹 Расчёт доставки по адресу через Google Maps API
- 🔹 Интеграция с AI (OpenRouter, GPT)
- 🔹 Сохранение заказов в Supabase
- 🔹 Обработка голосовых сообщений (через Whisper)

---

## 🧠 Стек технологий

| Категория        | Используемое |
|------------------|--------------|
| Язык             | JavaScript (Node.js) |
| Мессенджер API   | whatsapp-web.js |
| AI-интеграция    | OpenRouter (GPT), Whisper |
| База данных      | Supabase (PostgreSQL) |
| Работа с голосом | Whisper через Python |
| Прочее           | dotenv, axios, Google Maps API |

---

## 📁 Структура проекта
```
├── modules/
│ ├── aiResponder.js # Ответы от GPT
│ ├── deliveryCalculator.js # Расчет доставки
│ ├── orderHandler.js # Заказы
│ ├── sessionManager.js # Сессии пользователя
│ ├── supabase.js # Работа с БД
│ └── transcriber.js # Распознавание речи
├── index.js # Точка входа
├── package.json
├── .env # Переменные среды (НЕ выкладывать!)
├── .gitignore
├── ПЛЮСЫ БОТА.txt
```

---

## ⚙️ Установка

## Склонировать проект:

git clone https://github.com/sabyrzakirov/whatsapp-bot-store.git
cd whatsapp-bot-store

## Установить зависимости:

npm install

## Создать .env файл:
```
OPENROUTER_API_KEY=ваш_ключ
SUPABASE_URL=https://ваш-проект.supabase.co
SUPABASE_KEY=ваш_секрет
GOOGLE_MAPS_API_KEY=ваш_ключ
```
## Запустить бота:
```
node index.js
```

## 🧪 Пример запроса:
```
👤 Клиент: Хочу шуруповерт
🤖 Бот:
1. Makita 48V — 8000₸
2. Bosch GSB 180-LI — 9500₸
```
📍 Введите адрес для расчета доставки...



## 🧑‍💻 Автор:
```
Сабыр Закиров
🎓 Каспийский общественный университет
🌐 sabyr.netlify.app

```
##  Другие проекты:
```

```
## 📃 Лицензия
Проект доступен под лицензией MIT.
