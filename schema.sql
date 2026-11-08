-- Database Migration for universespacecosmicbion
-- Compatible with Cloudflare D1 and PostgreSQL

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  utcTimestamp INTEGER,
  action TEXT,
  status TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payout_queue (
  id TEXT PRIMARY KEY,
  recipient_address TEXT NOT NULL,
  amount_usdt REAL NOT NULL,
  chain_id INTEGER NOT NULL DEFAULT 42161,
  payout_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME
);

CREATE TABLE IF NOT EXISTS trade_logs (
  id TEXT PRIMARY KEY,
  user_address TEXT NOT NULL,
  from_chain_id INTEGER NOT NULL,
  to_chain_id INTEGER NOT NULL,
  from_token TEXT NOT NULL,
  to_token TEXT NOT NULL,
  volume_usd REAL NOT NULL,
  tx_hash TEXT NOT NULL,
  referrer_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS referral_credits (
  id TEXT PRIMARY KEY,
  referrer_address TEXT NOT NULL,
  trader_address TEXT NOT NULL,
  trade_volume_usd REAL NOT NULL,
  credit_usdt REAL NOT NULL,
  tx_hash TEXT NOT NULL,
  payout_queue_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_active_volume (
  id TEXT PRIMARY KEY,
  user_address TEXT NOT NULL,
  volume_usd REAL NOT NULL DEFAULT 0,
  trade_count INTEGER NOT NULL DEFAULT 0,
  epoch_date TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_address, epoch_date)
);

CREATE TABLE IF NOT EXISTS daily_awards_history (
  id TEXT PRIMARY KEY,
  epoch_date TEXT NOT NULL,
  user_address TEXT NOT NULL,
  volume_usd REAL NOT NULL,
  percentile REAL NOT NULL,
  award_usdt REAL NOT NULL,
  payout_queue_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS global_reward_pool (
  id INTEGER PRIMARY KEY DEFAULT 1,
  pool_date TEXT NOT NULL,
  current_pool_usdt REAL NOT NULL DEFAULT 1250.00,
  total_volume_usd REAL NOT NULL DEFAULT 0,
  total_trades_count INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO global_reward_pool (id, pool_date, current_pool_usdt, total_volume_usd, total_trades_count)
VALUES (1, CURRENT_DATE, 1250.00, 0, 0);

CREATE TABLE IF NOT EXISTS referral_codes (
  code TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS referral_bindings (
  invited_address TEXT PRIMARY KEY,
  referrer_address TEXT NOT NULL,
  first_tx_hash TEXT NOT NULL,
  bound_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS referral_payout_logs (
  id TEXT PRIMARY KEY,
  trade_tx_hash TEXT NOT NULL,
  referrer_address TEXT NOT NULL,
  trader_address TEXT NOT NULL,
  trade_volume_usd REAL NOT NULL,
  payout_usdt REAL NOT NULL,
  chain_id INTEGER NOT NULL DEFAULT 137,
  payout_tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS award_pool_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  target_volume_usdt REAL NOT NULL DEFAULT 1000.00,
  is_active INTEGER NOT NULL DEFAULT 1,
  polygon_wallet_address TEXT NOT NULL DEFAULT '0x9965507D1a55bcC2695C58ba16FB37d819B0A4df',
  polygon_usdt_contract TEXT NOT NULL DEFAULT '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  chain_id INTEGER NOT NULL DEFAULT 137,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO award_pool_config (id, target_volume_usdt, is_active, polygon_wallet_address, polygon_usdt_contract, chain_id)
VALUES (1, 1000.00, 1, '0x9965507D1a55bcC2695C58ba16FB37d819B0A4df', '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', 137);

CREATE TABLE IF NOT EXISTS daily_user_volume (
  id TEXT PRIMARY KEY,
  user_address TEXT NOT NULL,
  volume_usd REAL NOT NULL DEFAULT 0,
  trade_count INTEGER NOT NULL DEFAULT 0,
  epoch_date TEXT NOT NULL,
  is_qualified INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_address, epoch_date)
);

CREATE TABLE IF NOT EXISTS award_pool_payout_logs (
  id TEXT PRIMARY KEY,
  epoch_date TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  volume_usd REAL NOT NULL,
  proportional_percent REAL NOT NULL,
  awarded_usdt REAL NOT NULL,
  tx_hash TEXT NOT NULL,
  chain_id INTEGER NOT NULL DEFAULT 137,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
