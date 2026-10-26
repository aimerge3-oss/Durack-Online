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

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_wins ON users(wins_random DESC);

CREATE TABLE IF NOT EXISTS stickers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  emoji TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS user_stickers (
  user_id INTEGER NOT NULL,
  sticker_id INTEGER NOT NULL,
  purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, sticker_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (sticker_id) REFERENCES stickers(id)
);

-- Сид стикеров (
INSERT OR IGNORE INTO stickers (id, name, price, emoji, description) VALUES
  (1, 'Классика', 50, '🃏', 'Карта'),
  (2, 'Огонь', 100, '🔥', 'Жар'),
  (3, 'Молния', 150, '⚡', 'Скорость'),
  (4, 'Корона', 300, '👑', 'Победитель'),
  (5, 'Черт', 200, '👿', 'Дурак'),
  (6, 'Звезда', 250, '⭐', 'Удача'),
  (7, 'Роза', 80, '🌹', 'Стиль'),
  (8, 'Ракета', 500, '🚀', 'Премиум');
