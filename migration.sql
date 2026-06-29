-- 新機能用のDBスキーマ変更（Supabaseの SQL Editor で実行してください）

-- 1. 食事の塩分（mg）
ALTER TABLE meals ADD COLUMN IF NOT EXISTS sodium numeric DEFAULT 0;

-- 2. メール通知先アドレス
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_email text;

-- 3. お酒フラグ
ALTER TABLE meals ADD COLUMN IF NOT EXISTS has_alcohol boolean DEFAULT false;
