# Дурак Онлайн (Durack Online)

Классический Дурак в Telegram Mini App.  
Хостинг: **Cloudflare Workers** + D1 + Durable Objects.  
Фронт: GitHub Pages / Cloudflare Pages.

**Планируемый Worker URL:**  
`https://durack-online.pozzistory666.workers.dev`

**GitHub Pages (фронт):**  
`https://aimerge3-oss.github.io/Durack-Online/`

---

## Структура проекта

```
durack-online/
├── package.json
├── wrangler.toml          # конфиг Cloudflare Worker
├── schema.sql             # схема D1
├── src/
│   ├── index.js           # entry point + роутер
│   ├── auth.js            # валидация Telegram initData
│   ├── api.js             # /me, /leaderboard
│   └── game-room.js       # Durable Object (комнаты)
└── public/                # фронт (Telegram Mini App)
    ├── index.html
    ├── styles.css
    └── app.js
```

---

## Этапы разработки

### Этап 1 — MVP (сейчас)
- [x] Структура проекта
- [x] Авторизация через Telegram Mini App (`initData`)
- [x] D1 схема пользователей
- [x] Базовое меню + лидерборд (заглушка)
- [ ] Полная логика классического Дурака
- [ ] Matchmaking + WebSocket комнаты
- [ ] Таймер 15 секунд на ход
- [ ] UI игрового стола по референсам

### Этап 2 — Бета
- Монеты, рефералка (+500), стикеры
- Лидерборд по победам в рандоме
- Полировка UI, звуки, стабильность
- Проверка подписки на канал (сейчас отключена)

---

## Быстрый старт (локально)

### 1. Установка

```bash
npm install
```

### 2. Создать D1 базу

```bash
npx wrangler d1 create durack-db
```

Скопируй `database_id` в `wrangler.toml`.

### 3. Применить схему

```bash
npx wrangler d1 execute durack-db --file=./schema.sql
# или локально:
npx wrangler d1 execute durack-db --local --file=./schema.sql
```

### 4. Секреты

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
# вставь токен от @BotFather
```

### 5. Запуск локально

```bash
npx wrangler dev
```

Worker будет на `http://localhost:8787`.

### 6. Деплой

```bash
npx wrangler deploy
```

После деплоя URL будет вида:  
`https://durack-online.<твой-subdomain>.workers.dev`  
(по плану: `durack-online.pozzistory666.workers.dev`)

---

## Настройка Telegram Mini App

1. Создай бота у [@BotFather](https://t.me/BotFather)
2. `/newapp` → выбери бота → укажи название
3. **Web App URL** поставь:
   - Пока фронт на GitHub Pages: `https://aimerge3-oss.github.io/Durack-Online/`
   - Или Cloudflare Pages / тот же Worker (если раздаёшь статику)
4. В `public/app.js` уже прописан API:
   ```js
   const API_BASE = 'https://durack-online.pozzistory666.workers.dev';
   ```
5. После деплоя Worker — проверь `/auth`.

---

## Авторизация

Фронт отправляет `Telegram.WebApp.initData` на `POST /auth`.  
Бэкенд проверяет подпись по официальному алгоритму Telegram (HMAC-SHA256).  
Создаёт/обновляет пользователя в D1 и возвращает профиль + токен.

Рефералка: если в `start_param` передан `telegram_id` пригласившего — ему +500 монет.

---

## Следующие шаги

1. Задеплоить Worker и прописать реальный URL.
2. Включить GitHub Pages для папки `public/` (или root).
3. Реализовать логику Дурака (`GameRoom` + класс игры).
4. Сделать UI стола по скриншотам.

---

## Лицензия

MIT
