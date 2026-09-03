CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('viewer', 'user', 'creator', 'admin', 'banned')),
  plan VARCHAR(20) DEFAULT 'free' CHECK (plan IN ('free', 'student', 'basic', 'standard', 'premium')),
  avatar TEXT,
  bio TEXT DEFAULT '',
  email_verified BOOLEAN DEFAULT FALSE,
  verification_code VARCHAR(6),
  verification_code_expires TIMESTAMP,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('viewer', 'user', 'creator', 'admin', 'banned'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;
ALTER TABLE users ADD CONSTRAINT users_plan_check CHECK (plan IN ('free', 'student', 'basic', 'standard', 'premium'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;

-- User settings (playback + notification prefs) synced across devices
ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- Google OAuth support: Google-linked accounts may have no password
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;

-- Social OAuth identity columns (Claim Profile verification + social login)
ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tiktok_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS twitter_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS youtube_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS twitch_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id VARCHAR(255) UNIQUE;

CREATE TABLE IF NOT EXISTS creator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(255),
  bio TEXT,
  avatar TEXT,
  stripe_account_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Creator claim requests (TMDB profile claim w/ social OAuth verification)
CREATE TABLE IF NOT EXISTS creator_claim_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  tmdb_person_id INT NOT NULL,
  display_name VARCHAR(255),
  verification_provider VARCHAR(32),
  social_handle VARCHAR(255),
  social_profile_url TEXT,
  kyc_status VARCHAR(20) DEFAULT 'pending',
  kyc_data JSONB,
  claim_status VARCHAR(20) DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (tmdb_person_id)
);
CREATE INDEX IF NOT EXISTS idx_creator_claim_tmdb ON creator_claim_requests (tmdb_person_id);

CREATE TABLE IF NOT EXISTS uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  genre VARCHAR(100),
  filename VARCHAR(500),
  thumbnail_url VARCHAR(500) DEFAULT '',
  filesize BIGINT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  views BIGINT DEFAULT 0,
  minutes_watched BIGINT DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0,
  source_type VARCHAR(20) DEFAULT 'file',
  youtube_id VARCHAR(100) DEFAULT '',
  youtube_url VARCHAR(500) DEFAULT '',
  quality VARCHAR(20) DEFAULT '',
  duration_seconds INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE uploads ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'file';
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS youtube_id VARCHAR(100) DEFAULT '';
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS youtube_url VARCHAR(500) DEFAULT '';
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS quality VARCHAR(20) DEFAULT '';
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS shorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  video_url TEXT NOT NULL,
  thumbnail_url TEXT DEFAULT '',
  duration_seconds INT DEFAULT 0,
  views BIGINT DEFAULT 0,
  likes BIGINT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS short_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_id UUID REFERENCES shorts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (short_id, user_id)
);

ALTER TABLE shorts ADD COLUMN IF NOT EXISTS bookmarks BIGINT DEFAULT 0;
ALTER TABLE shorts ADD COLUMN IF NOT EXISTS comments BIGINT DEFAULT 0;
ALTER TABLE shorts ADD COLUMN IF NOT EXISTS shares BIGINT DEFAULT 0;
ALTER TABLE shorts ADD COLUMN IF NOT EXISTS trailer_url TEXT DEFAULT '';
ALTER TABLE shorts ADD COLUMN IF NOT EXISTS media_id BIGINT;
ALTER TABLE shorts ADD COLUMN IF NOT EXISTS media_type VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_shorts_created_at ON shorts (created_at DESC);

CREATE TABLE IF NOT EXISTS short_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_id UUID REFERENCES shorts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (short_id, user_id)
);

CREATE TABLE IF NOT EXISTS short_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_id UUID REFERENCES shorts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS follower_count BIGINT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS following_count BIGINT DEFAULT 0;

CREATE TABLE IF NOT EXISTS watch_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content_id VARCHAR(255),
  title VARCHAR(255),
  type VARCHAR(20),
  minutes INT DEFAULT 0,
  season INT,
  episode INT,
  position_seconds INT DEFAULT 0,
  duration_seconds INT DEFAULT 0,
  poster VARCHAR(500),
  watched_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS position_seconds INT DEFAULT 0;
ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 0;
ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS poster VARCHAR(500);
ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

DO $$
BEGIN
  DELETE FROM watch_history a
  USING watch_history b
  WHERE a.id < b.id
    AND a.user_id = b.user_id
    AND a.content_id = b.content_id
    AND a.type = b.type
    AND COALESCE(a.season, -1) = COALESCE(b.season, -1)
    AND COALESCE(a.episode, -1) = COALESCE(b.episode, -1);
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS watch_history_user_content_uniq
  ON watch_history (user_id, content_id, type, COALESCE(season, -1), COALESCE(episode, -1));

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  plan VARCHAR(20) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  started_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  message TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS newsletter_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed')),
  subscribed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR(255);
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS tmdb_person_id INT;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS known_for_department VARCHAR(100);
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS paystack_recipient_code VARCHAR(255);
-- Gateway-specific bank columns to prevent cross-gateway overwrite (H5 fix)
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS paystack_bank_code VARCHAR(20);
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS paystack_account_number VARCHAR(20);
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS paystack_account_name VARCHAR(255);
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS flutterwave_bank_code VARCHAR(20);
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS flutterwave_account_number VARCHAR(20);
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS flutterwave_account_name VARCHAR(255);
-- Wallet balance / commission columns
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS wallet_balance_ngn NUMERIC(14,2) DEFAULT 0;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS paystack_verified_name VARCHAR(255);
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS flutterwave_beneficiary_id VARCHAR(255);
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS flutterwave_verified_name VARCHAR(255);
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS bank_code VARCHAR(20);
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS account_number VARCHAR(20);
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS account_name VARCHAR(255);
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS stage_name VARCHAR(255);
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS portfolio_url TEXT;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS payout_details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'approved';
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content_id VARCHAR(255) NOT NULL,
  content_type VARCHAR(20) NOT NULL,
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, content_id, content_type)
);

CREATE TABLE IF NOT EXISTS followers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(100),
  criteria JSONB
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  achievement_id UUID REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content_id VARCHAR(255) NOT NULL,
  content_type VARCHAR(20) NOT NULL,
  title VARCHAR(255),
  poster VARCHAR(500),
  year VARCHAR(10),
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, content_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content_id VARCHAR(255) NOT NULL,
  content_type VARCHAR(20) NOT NULL,
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artist_graph (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_a_id UUID REFERENCES users(id) ON DELETE CASCADE,
  person_b_id UUID REFERENCES users(id) ON DELETE CASCADE,
  movie_id VARCHAR(255) NOT NULL,
  movie_title VARCHAR(255),
  role_a VARCHAR(100),
  role_b VARCHAR(100),
  weight INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(person_a_id, person_b_id, movie_id)
);

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  advertiser_name VARCHAR(255) NOT NULL,
  creative_url TEXT NOT NULL,
  creative_type VARCHAR(20) DEFAULT 'image',
  promotion_type VARCHAR(20) DEFAULT 'grid' CHECK (promotion_type IN ('grid', 'hooks', 'banner')),
  target_genre VARCHAR(100),
  target_plan VARCHAR(20),
  target_media_id VARCHAR(255),
  max_impressions INT DEFAULT 0,
  current_impressions INT DEFAULT 0,
  budget DECIMAL(10,2) DEFAULT 0,
  spent DECIMAL(10,2) DEFAULT 0,
  approved BOOLEAN DEFAULT FALSE,
  start_date TIMESTAMP DEFAULT NOW(),
  end_date TIMESTAMP,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  -- VAST/VMAP support
  vast_url TEXT,
  vmap_url TEXT,
  is_vast BOOLEAN DEFAULT FALSE,
  click_url TEXT,
  ad_pod_duration INT DEFAULT 60, -- mid-roll pod duration in seconds
  channel VARCHAR(20) DEFAULT 'internal' CHECK (channel IN ('google','creator','internal')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  rejection_reason TEXT,
  paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMP,
  gam_tag_url TEXT,
  is_house BOOLEAN DEFAULT FALSE
);

ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS promotion_type VARCHAR(20) DEFAULT 'grid';
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS target_media_id VARCHAR(255);
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS spent DECIMAL(10,2) DEFAULT 0;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT FALSE;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS vast_url TEXT;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS vmap_url TEXT;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS is_vast BOOLEAN DEFAULT FALSE;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS click_url TEXT;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS ad_pod_duration INT DEFAULT 60;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'internal' CHECK (channel IN ('google','creator','internal'));
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended'));
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT FALSE;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS gam_tag_url TEXT;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS is_house BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS ad_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  content_id VARCHAR(255),
  position_type VARCHAR(30) NOT NULL CHECK (position_type IN ('pre_roll', 'mid_roll', 'post_roll', 'pause', 'binge_pass', 'promoted', 'banner')),
  cue_time_seconds INT DEFAULT 0,
  duration_seconds INT DEFAULT 15,
  skip_after_seconds INT DEFAULT 0,
  warning_seconds INT DEFAULT 10, -- pre-mid-roll warning
  is_unskippable BOOLEAN DEFAULT TRUE, -- for free tier pre/mid-roll
  ad_pod_position INT DEFAULT 0, -- position in ad pod (for mid-roll pods)
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE ad_placements ADD COLUMN IF NOT EXISTS warning_seconds INT DEFAULT 10;
ALTER TABLE ad_placements ADD COLUMN IF NOT EXISTS is_unskippable BOOLEAN DEFAULT TRUE;
ALTER TABLE ad_placements ADD COLUMN IF NOT EXISTS ad_pod_position INT DEFAULT 0;
ALTER TABLE ad_impressions ADD COLUMN IF NOT EXISTS channel VARCHAR(20);
ALTER TABLE ad_impressions ADD COLUMN IF NOT EXISTS quartile VARCHAR(20);

CREATE TABLE IF NOT EXISTS ad_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_type VARCHAR(30) NOT NULL UNIQUE CHECK (position_type IN ('pre_roll','mid_roll','post_roll','pause','banner')),
  price_per_mille INT NOT NULL DEFAULT 800,
  min_impressions INT NOT NULL DEFAULT 500,
  max_impressions_cap INT NOT NULL DEFAULT 50000,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
INSERT INTO ad_pricing (position_type, price_per_mille) VALUES
  ('pre_roll', 800), ('mid_roll', 600), ('post_roll', 400), ('pause', 500), ('banner', 300)
ON CONFLICT (position_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS ad_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT NOW()
);
INSERT INTO ad_settings (key, value) VALUES
  ('waterfall', '{"order":["creator","internal","google"]}'::jsonb),
  ('frequency', '{"mid_roll_interval_seconds":1800,"ad_pod_max_duration":60,"max_campaigns_per_creator":5}'::jsonb),
  ('skippability', '{"pre_roll":true,"mid_roll":true,"post_roll":false,"pause":false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS ad_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id UUID REFERENCES ad_placements(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  completed BOOLEAN DEFAULT FALSE,
  watched_seconds INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS binge_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content_id VARCHAR(255),
  minutes_granted INT DEFAULT 60,
  minutes_used INT DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skip_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  skips_used INT DEFAULT 0,
  skips_max INT DEFAULT 6,
  window_start TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  referred_id UUID REFERENCES users(id) ON DELETE SET NULL,
  code VARCHAR(20) UNIQUE NOT NULL,
  commission DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'paid')),
  created_at TIMESTAMP DEFAULT NOW(),
  converted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(255),
  ip_address VARCHAR(45),
  started_at TIMESTAMP DEFAULT NOW(),
  last_heartbeat TIMESTAMP DEFAULT NOW()
);

-- Download device registry (per-plan caps: free 0, student/basic 1, standard 2, premium 6)
CREATE TABLE IF NOT EXISTS download_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_name VARCHAR(255),
  platform VARCHAR(50),
  registered_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, device_id)
);
CREATE INDEX IF NOT EXISTS idx_download_devices_user ON download_devices (user_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  first_seen_at TIMESTAMP DEFAULT NOW(),
  last_seen_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_devices_user_device_idx ON user_devices (user_id, device_id);

CREATE TABLE IF NOT EXISTS user_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION DEFAULT 0,
  source VARCHAR(20) DEFAULT 'geolocation',
  ip_address VARCHAR(45),
  user_agent TEXT,
  first_seen_at TIMESTAMP DEFAULT NOW(),
  last_seen_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_locations_user_latlng_idx ON user_locations (user_id, lat, lng);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reference VARCHAR(255) UNIQUE NOT NULL,
  type VARCHAR(50) NOT NULL,
  plan VARCHAR(20),
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creator_membership_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT DEFAULT '',
  price DECIMAL(10,2) NOT NULL,
  benefits JSONB DEFAULT '[]',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creator_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tier_id UUID REFERENCES creator_membership_tiers(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  started_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  cancelled_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS live_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT '',
  event_date TIMESTAMP NOT NULL,
  ticket_price DECIMAL(10,2) DEFAULT 0,
  total_tickets INT DEFAULT 0,
  available_tickets INT DEFAULT 0,
  poster_url TEXT DEFAULT '',
  stream_url TEXT DEFAULT '',
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES live_events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'used', 'refunded')),
  purchased_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  price DECIMAL(10,2) NOT NULL,
  image_url TEXT DEFAULT '',
  category VARCHAR(100) DEFAULT 'general',
  popular BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  total DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
  reference VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  quantity INT DEFAULT 1,
  price DECIMAL(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  price DECIMAL(10,2) NOT NULL,
  image_url TEXT DEFAULT '',
  category VARCHAR(100) DEFAULT 'general',
  duration VARCHAR(50) DEFAULT '',
  lessons_count INT DEFAULT 0,
  students_count INT DEFAULT 0,
  rating DECIMAL(2,1) DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS archive_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  content_type VARCHAR(50) DEFAULT 'video' CHECK (content_type IN ('video', 'article', 'gallery', 'audio')),
  media_url TEXT DEFAULT '',
  poster_url TEXT DEFAULT '',
  year VARCHAR(10) DEFAULT '',
  genre VARCHAR(100) DEFAULT '',
  min_plan VARCHAR(20) DEFAULT 'free' CHECK (min_plan IN ('free', 'student', 'basic', 'standard', 'premium')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS archive_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  archive_id UUID REFERENCES archive_items(id) ON DELETE CASCADE,
  accessed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  avatar TEXT,
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  member_count INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(community_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS actors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id INT UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  avatar TEXT,
  biography TEXT DEFAULT '',
  known_for_department VARCHAR(100) DEFAULT '',
  popularity DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  progress DECIMAL(5,2) DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  enrolled_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, course_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name VARCHAR(255),
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room, created_at);

-- ============ SOCIAL FOUNDATION ============
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(16) UNIQUE NOT NULL,
  content_id VARCHAR(255) NOT NULL,
  content_type VARCHAR(20) DEFAULT 'movie',
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  clicks INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_share_links_content ON share_links(content_id, content_type);
CREATE INDEX IF NOT EXISTS idx_share_links_code ON share_links(code);

-- ============ COMMENTS EXTENSIONS (video/voice + threading + time-capsule) ============
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES comments(id) ON DELETE CASCADE;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS media_type VARCHAR(20);
ALTER TABLE comments ADD COLUMN IF NOT EXISTS duration_seconds INT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS unlock_at TIMESTAMP;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS milestone_unlock VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_comments_content ON comments(content_id, content_type);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);

-- ============ FAN ENGAGEMENT / SUPERFAN LEADERBOARDS ============
CREATE TABLE IF NOT EXISTS fan_engagement (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  shares INT DEFAULT 0,
  watch_minutes INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, creator_id)
);

-- ============ HOT-TAKE FORUM ============
CREATE TABLE IF NOT EXISTS forum_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  category VARCHAR(100) DEFAULT 'general',
  content TEXT NOT NULL,
  author_id UUID REFERENCES users(id) ON DELETE CASCADE,
  upvotes INT DEFAULT 0,
  downvotes INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_forum_topics_cat ON forum_topics(category, created_at);

CREATE TABLE IF NOT EXISTS forum_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES forum_topics(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES forum_replies(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  upvotes INT DEFAULT 0,
  downvotes INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_forum_replies_topic ON forum_replies(topic_id, created_at);

CREATE TABLE IF NOT EXISTS forum_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type VARCHAR(10) DEFAULT 'topic' CHECK (target_type IN ('topic','reply')),
  target_id UUID NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  vote SMALLINT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(target_type, target_id, user_id)
);

-- Hot-takes debate columns for pre-existing installs (fresh creates above stay unchanged).
ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS movie_title VARCHAR(255);
ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS movie_poster_url TEXT;
ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS no_spoilers BOOLEAN DEFAULT TRUE;
ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS stance VARCHAR(10) DEFAULT NULL CHECK (stance IN ('agree','disagree'));

-- ============ TRIVIA / GAMIFICATION ============
CREATE TABLE IF NOT EXISTS trivia_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type VARCHAR(20) DEFAULT 'trivia' CHECK (game_type IN ('trivia','guess')),
  date_key VARCHAR(10),
  question TEXT NOT NULL,
  options JSONB,
  answer_index INT,
  answer_text TEXT,
  movie_id INT,
  movie_title VARCHAR(255),
  difficulty VARCHAR(20) DEFAULT 'easy',
  clue TEXT,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trivia_date ON trivia_questions(date_key);

CREATE TABLE IF NOT EXISTS trivia_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID REFERENCES trivia_questions(id) ON DELETE CASCADE,
  game_type VARCHAR(20),
  correct BOOLEAN,
  points_awarded INT DEFAULT 0,
  answered_at TIMESTAMP DEFAULT NOW()
);
-- Unique per user/question/day: backs the ON CONFLICT target in submitDaily
-- (without this index every POST /api/trivia/submit fails with 42P10).
CREATE UNIQUE INDEX IF NOT EXISTS ux_trivia_attempts_user_question_day
  ON trivia_attempts (user_id, question_id, (answered_at::date));
CREATE UNIQUE INDEX IF NOT EXISTS ux_trivia_questions_date_movie
  ON trivia_questions (date_key, movie_id);
CREATE INDEX IF NOT EXISTS idx_trivia_attempts_points
  ON trivia_attempts (points_awarded DESC);
CREATE INDEX IF NOT EXISTS idx_trivia_attempts_user_game
  ON trivia_attempts (user_id, game_type, answered_at);

CREATE TABLE IF NOT EXISTS trivia_streaks (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  streak INT DEFAULT 0,
  best_streak INT DEFAULT 0,
  last_date VARCHAR(10),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cosmetics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  kind VARCHAR(30) DEFAULT 'badge' CHECK (kind IN ('badge','avatar_frame','title')),
  description TEXT,
  price INT DEFAULT 100,
  icon VARCHAR(255),
  rarity VARCHAR(20) DEFAULT 'common' CHECK (rarity IN ('common','rare','epic','legendary')),
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS user_cosmetics (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  cosmetic_id UUID REFERENCES cosmetics(id) ON DELETE CASCADE,
  equipped BOOLEAN DEFAULT FALSE,
  purchased_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, cosmetic_id)
);

-- Rarity tiers for pre-existing installs (fresh creates get it inline above).
ALTER TABLE cosmetics ADD COLUMN IF NOT EXISTS rarity VARCHAR(20) DEFAULT 'common';

-- ============ EASTER-EGG CONTENT HUNT (DIGITAL KEYS) ============
CREATE TABLE IF NOT EXISTS digital_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id VARCHAR(255) NOT NULL,
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(64) UNIQUE,
  ts_seconds NUMERIC(10,3) NOT NULL,
  pos_x NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  pos_y NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  radius NUMERIC(4,3) NOT NULL DEFAULT 0.08,
  hint VARCHAR(255) DEFAULT '',
  reward_type VARCHAR(20) NOT NULL DEFAULT 'badge' CHECK (reward_type IN ('badge','secret_room')),
  reward_ref UUID,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_digital_keys_content ON digital_keys(content_id);

CREATE TABLE IF NOT EXISTS collected_keys (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  key_id UUID REFERENCES digital_keys(id) ON DELETE CASCADE,
  collected_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, key_id)
);

CREATE TABLE IF NOT EXISTS secret_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID REFERENCES digital_keys(id) ON DELETE CASCADE UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============ CREATOR REVENUE (DUAL-POOL VPM) ============
CREATE TABLE IF NOT EXISTS creator_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period VARCHAR(7) NOT NULL,
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  pool_type VARCHAR(10) NOT NULL CHECK (pool_type IN ('movie','short')),
  minutes NUMERIC(14,3) NOT NULL DEFAULT 0,
  vpm NUMERIC(12,5) NOT NULL DEFAULT 0,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  settled_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (period, creator_id, pool_type)
);
CREATE INDEX IF NOT EXISTS idx_creator_earnings_creator ON creator_earnings(creator_id);
CREATE INDEX IF NOT EXISTS idx_creator_earnings_period ON creator_earnings(period);

CREATE TABLE IF NOT EXISTS glow_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  net_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_glow_gifts_creator ON glow_gifts(creator_id);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'system',
  title TEXT NOT NULL DEFAULT '',
  body TEXT DEFAULT '',
  link TEXT DEFAULT '',
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  plan VARCHAR(20) DEFAULT 'free',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- ============ Admin Platform ============

ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_profiles INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS creator_approved BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_creator_profiles_approval ON creator_profiles(approval_status);

ALTER TABLE uploads ADD COLUMN IF NOT EXISTS maturity_rating VARCHAR(20) DEFAULT 'PG';
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS language VARCHAR(20) DEFAULT 'en';
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS cast_list TEXT DEFAULT '';
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS trailer_url TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS subtitle_url TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS audio_tracks TEXT DEFAULT '';
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS artwork JSONB DEFAULT '{}';

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  entity VARCHAR(40),
  entity_id UUID,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON admin_audit_log(actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_type VARCHAR(40) NOT NULL,
  target_id UUID NOT NULL,
  reason VARCHAR(120) NOT NULL,
  details TEXT DEFAULT '',
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  user_name VARCHAR(255) DEFAULT '',
  appeal_type VARCHAR(20) DEFAULT 'suspension' CHECK (appeal_type IN ('suspension','ban')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  message TEXT NOT NULL,
  account_reason TEXT DEFAULT '',
  account_until TIMESTAMP,
  resolution_note TEXT DEFAULT '',
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appeals_user ON appeals(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  content_id UUID NOT NULL,
  content_type VARCHAR(40) NOT NULL,
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  text TEXT DEFAULT '',
  status VARCHAR(20) DEFAULT 'published' CHECK (status IN ('published','hidden','flagged')),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, content_id, content_type)
);
CREATE INDEX IF NOT EXISTS idx_reviews_content ON reviews(content_id, content_type);

CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) UNIQUE NOT NULL,
  plan VARCHAR(20) NOT NULL DEFAULT 'premium',
  discount_type VARCHAR(10) NOT NULL DEFAULT 'pct' CHECK (discount_type IN ('pct', 'fixed')),
  discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_amount INTEGER DEFAULT 0,
  apply_to_all_plans BOOLEAN DEFAULT FALSE,
  allowed_ips TEXT[],
  allowed_phones TEXT[],
  country VARCHAR(5),
  starts_at TIMESTAMP,
  usage_per_user INTEGER DEFAULT 0,
  mode VARCHAR(10) NOT NULL DEFAULT 'one_time' CHECK (mode IN ('one_time', 'recurring')),
  max_uses INTEGER DEFAULT 0,
  uses INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan VARCHAR(20) NOT NULL,
  original_amount INTEGER NOT NULL,
  discounted_amount INTEGER NOT NULL,
  ip VARCHAR(45),
  phone VARCHAR(30),
  redeemed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) DEFAULT '',
  image_url TEXT DEFAULT '',
  link TEXT DEFAULT '',
  position VARCHAR(30) DEFAULT 'home',
  active BOOLEAN DEFAULT TRUE,
  sort INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creator_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  handle VARCHAR(120) DEFAULT '',
  bio TEXT DEFAULT '',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS content_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL,
  content_type VARCHAR(40) NOT NULL,
  kind VARCHAR(30) NOT NULL CHECK (kind IN ('subtitle','audio','trailer','artwork')),
  label VARCHAR(120) DEFAULT '',
  url TEXT NOT NULL,
  sort INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_content_tracks_content ON content_tracks(content_id, content_type);

CREATE TABLE IF NOT EXISTS feed_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(80) UNIQUE NOT NULL,
  value JSONB DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO feed_settings (key, value) VALUES ('default_currency', '"NGN"') ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS audio_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) DEFAULT '',
  artist VARCHAR(120) DEFAULT '',
  url TEXT DEFAULT '',
  license VARCHAR(120) DEFAULT '',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  price DECIMAL(10,2) DEFAULT 0,
  discount_pct INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============ Admin Roles & Permissions (RBAC) ============
CREATE TABLE IF NOT EXISTS admin_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(60) UNIQUE NOT NULL,
  slug VARCHAR(60) UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  permissions JSONB DEFAULT '[]',
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_role_id UUID REFERENCES admin_roles(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_reason TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_users_admin_role ON users(admin_role_id);

CREATE TABLE IF NOT EXISTS plans (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  price INTEGER NOT NULL,
  currency VARCHAR(10) DEFAULT 'NGN',
  features JSONB DEFAULT '[]',
  sort_order INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO plans (slug, name, price, currency, features, sort_order) VALUES
  ('student', 'Student', 800, 'NGN', '["720p HD quality","All devices supported","1 screen at a time","Offline downloads (1 device)","Ad-supported","6 skips per hour"]', 1),
  ('basic', 'Basic', 1500, 'NGN', '["720p HD quality","All devices supported","1 screen at a time","Offline downloads (1 device)","Completely ad-free","6 skips per hour"]', 2),
  ('standard', 'Standard', 2500, 'NGN', '["1080p Full HD","All devices supported","2 screens simultaneously","Offline downloads (2 devices)","Completely ad-free","Unlimited skips"]', 3),
  ('premium', 'Premium', 5500, 'NGN', '["4K Ultra HD + Dolby Vision & HDR10","Spatial Audio support","All devices supported","4 screens simultaneously","Offline downloads (6 devices)","Completely ad-free","Unlimited skips","Premier access: indie theatrical drops, ticketed masterclasses, virtual red carpet lobbies"]', 4)
ON CONFLICT (slug) DO NOTHING;

-- ======================================================================
-- DISCOVERY ENGINE (Spotify-style search & creator profiles)
-- Creator <-> Movie many-to-many with explicit per-project role.
-- ======================================================================

-- Fuzzy matching support. Guarded so boot never fails on hosts where the
-- extension cannot be created; search then degrades to ILIKE fallbacks.
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm unavailable, discovery search falls back to ILIKE';
END $$;

-- Movie format type: SHORT = short-form film, LONG = feature-length film.
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS format VARCHAR(10) DEFAULT 'LONG';

-- Structural genre/mood tags simulating Spotify's attribute vectors,
-- e.g. ["psychological-thriller","indie","fast-paced"].
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_format_check;
ALTER TABLE uploads ADD CONSTRAINT uploads_format_check CHECK (format IN ('SHORT', 'LONG'));

-- Backfill format + tags from existing data (runtime under 40 min => SHORT).
UPDATE uploads SET format = 'SHORT'
WHERE duration_seconds > 0 AND duration_seconds < 2400 AND format IS DISTINCT FROM 'SHORT';

UPDATE uploads SET tags = to_jsonb(
  ARRAY[LOWER(REGEXP_REPLACE(COALESCE(genre, ''), '[^a-zA-Z0-9]+', '-', 'g'))]
)
WHERE (genre IS NOT NULL AND genre <> '')
  AND (tags IS NULL OR tags = '[]'::jsonb);

-- Junction table: which creator did WHAT on which movie.
CREATE TABLE IF NOT EXISTS movie_creators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('DIRECTED_BY', 'ACTED_IN')),
  character_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (movie_id, creator_id, role)
);

CREATE INDEX IF NOT EXISTS idx_movie_creators_creator ON movie_creators (creator_id);
CREATE INDEX IF NOT EXISTS idx_movie_creators_movie ON movie_creators (movie_id);
CREATE INDEX IF NOT EXISTS idx_movie_creators_role ON movie_creators (role);

-- Backfill: every uploader is the primary creator (director) of their uploads.
INSERT INTO movie_creators (movie_id, creator_id, role)
SELECT u.id, u.user_id, 'DIRECTED_BY'
FROM uploads u
WHERE u.user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Keep the junction in sync for future uploads.
CREATE OR REPLACE FUNCTION sync_movie_creator_director() RETURNS trigger AS $$
BEGIN
  INSERT INTO movie_creators (movie_id, creator_id, role)
  VALUES (NEW.id, NEW.user_id, 'DIRECTED_BY')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_uploads_director ON uploads;
CREATE TRIGGER trg_uploads_director
AFTER INSERT ON uploads
FOR EACH ROW EXECUTE FUNCTION sync_movie_creator_director();

-- Trigram indexes for fuzzy search (only when pg_trgm exists). GIN trgm on
-- names/titles; plain btree/GIN otherwise still keeps lookups fast.
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_uploads_title_trgm ON uploads USING gin (title gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS idx_users_name_trgm ON users USING gin (name gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_uploads_status_title ON uploads (status, title);
CREATE INDEX IF NOT EXISTS idx_uploads_tags ON uploads USING gin (tags);

-- ============================================================================
-- Creator tools: PPM config, stream keys, and onboarding profile (Phase 1.4/1.5)
-- ============================================================================
CREATE TABLE IF NOT EXISTS creator_ppm_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  movie_vpm NUMERIC(12,5) NOT NULL DEFAULT 2.50,
  short_vpm NUMERIC(12,5) NOT NULL DEFAULT 1.20,
  minimum_payout NUMERIC(12,2) NOT NULL DEFAULT 50.00,
  auto_settle BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (creator_id)
);

CREATE TABLE IF NOT EXISTS creator_stream_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  stream_key VARCHAR(128) NOT NULL,
  stream_url VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (creator_id)
);

CREATE TABLE IF NOT EXISTS creator_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'offline',
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  viewer_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB
);
CREATE INDEX IF NOT EXISTS idx_creator_streams_creator ON creator_streams(creator_id, status);

CREATE TABLE IF NOT EXISTS creator_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  step INTEGER NOT NULL DEFAULT 1,
  identity JSONB,
  links JSONB,
  monetization JSONB,
  payout JSONB,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (creator_id)
);

-- Ensure creator_ppm_config (from migration 001) has all PPM columns (idempotent)
ALTER TABLE creator_ppm_config ADD COLUMN IF NOT EXISTS movie_vpm NUMERIC(12,5) NOT NULL DEFAULT 2.50;
ALTER TABLE creator_ppm_config ADD COLUMN IF NOT EXISTS short_vpm NUMERIC(12,5) NOT NULL DEFAULT 1.20;
ALTER TABLE creator_ppm_config ADD COLUMN IF NOT EXISTS minimum_payout NUMERIC(12,2) NOT NULL DEFAULT 50.00;
ALTER TABLE creator_ppm_config ADD COLUMN IF NOT EXISTS auto_settle BOOLEAN NOT NULL DEFAULT TRUE;
-- Unified PPM payout rate (admin-set, single source of truth for payouts)
ALTER TABLE creator_ppm_config ADD COLUMN IF NOT EXISTS base_rate NUMERIC(12,5) DEFAULT 10.00;
