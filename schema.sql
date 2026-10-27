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
  PRIMARY KEY (user_id, sticker_id)
);

INSERT OR IGNORE INTO stickers (id, name, price, emoji, description) VALUES
  (1, 'Классика', 50, '🃏', 'Карта'),
  (2, 'Огонь', 100, '🔥', 'Жар'),
  (3, 'Молния', 150, '⚡', 'Скорость'),
  (4, 'Корона', 300, '👑', 'Победитель'),
  (5, 'Черт', 200, '👿', 'Дурак'),
  (6, 'Звезда', 250, '⭐', 'Удача'),
  (7, 'Роза', 80, '🌹', 'Стиль'),
  (8, 'Ракета', 500, '🚀', 'Премиум');

-- Дневные квесты
CREATE TABLE IF NOT EXISTS quest_progress (
  user_id INTEGER NOT NULL,
  quest_id TEXT NOT NULL,
  day TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  claimed INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, quest_id, day)
);

-- История игр
CREATE TABLE IF NOT EXISTS game_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL,
  mode TEXT NOT NULL,
  result TEXT NOT NULL,
  coins_delta INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_history_tg ON game_history(telegram_id, created_at DESC);

-- Турниры (запуск админом)
CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  title TEXT,
  status TEXT DEFAULT 'open',
  max_players INTEGER DEFAULT 8,
  created_by INTEGER,
  prize INTEGER DEFAULT 200,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournament_players (
  tournament_id INTEGER NOT NULL,
  telegram_id INTEGER NOT NULL,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id, telegram_id)
);
