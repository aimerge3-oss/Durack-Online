-- Пользователи
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  photo_url TEXT,
  coins INTEGER DEFAULT 0,
  wins_random INTEGER DEFAULT 0,
  referrer_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_wins ON users(wins_random DESC);

-- Простая таблица для будущих стикеров
CREATE TABLE IF NOT EXISTS stickers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  emoji TEXT
);

-- Купленные стикеры
CREATE TABLE IF NOT EXISTS user_stickers (
  user_id INTEGER NOT NULL,
  sticker_id INTEGER NOT NULL,
  purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, sticker_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (sticker_id) REFERENCES stickers(id)
);
