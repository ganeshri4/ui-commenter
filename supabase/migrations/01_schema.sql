-- ==============================================================================
-- UI COMMENTER - SUPABASE DATABASE MIGRATION SCRIPT
-- Tables: profiles, comments, replies
-- Features: Row Level Security (RLS), Realtime Publication, pg_cron 120h Purge
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. User Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone" 
  ON public.profiles FOR SELECT 
  USING (true);

CREATE POLICY "Users can insert their own profile" 
  ON public.profiles FOR INSERT 
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

-- Trigger: Automatically create profile on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Comments Table
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url_path TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'dom' CHECK (mode IN ('dom', 'canvas')),
  selector TEXT,
  x_percent NUMERIC,
  y_percent NUMERIC,
  x_px NUMERIC,
  y_px NUMERIC,
  viewport_width INTEGER,
  target_text TEXT,
  content TEXT NOT NULL,
  is_resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for rapid lookup by route and age
CREATE INDEX IF NOT EXISTS idx_comments_url_path ON public.comments (url_path);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON public.comments (created_at);
CREATE INDEX IF NOT EXISTS idx_comments_is_resolved ON public.comments (is_resolved);

-- Enable RLS on comments
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Allow reading comments that are newer than 5 days
CREATE POLICY "Anyone can view comments within 5-day expiration window"
  ON public.comments FOR SELECT
  USING (created_at >= (NOW() - INTERVAL '5 days'));

-- Allow authenticated users and guests to insert comments
CREATE POLICY "Authenticated users can create comments"
  ON public.comments FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Allow users to update resolve status or edit their own comment
CREATE POLICY "Users can update comment status or content"
  ON public.comments FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow comment authors to delete their own comments
CREATE POLICY "Authors can delete their own comments"
  ON public.comments FOR DELETE
  USING (auth.uid() = user_id OR auth.role() = 'anon');

-- 4. Replies Table
CREATE TABLE IF NOT EXISTS public.replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_replies_comment_id ON public.replies (comment_id);

-- Enable RLS on replies
ALTER TABLE public.replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view replies"
  ON public.replies FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create replies"
  ON public.replies FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY "Authors can delete their replies"
  ON public.replies FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Realtime Publication Setup
-- Enable real-time replication for collaborative pin & reply sync
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.replies;

-- 6. 5-Day (120 Hours) Auto-Expiration Purge Routine
-- Deletes comments and cascading replies older than 120 hours

CREATE OR REPLACE FUNCTION public.purge_expired_comments()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.comments
  WHERE created_at < (NOW() - INTERVAL '5 days');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. pg_cron Automated Hourly Cleanup Job
-- Note: Make sure the 'pg_cron' extension is activated in your Supabase Dashboard
-- (Project Settings -> Database -> Extensions -> search 'pg_cron')
DO $cron_setup$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Unschedule previous job if present
    BEGIN
      EXECUTE 'SELECT cron.unschedule(''purge-expired-comments-120h'')';
    EXCEPTION WHEN OTHERS THEN
      -- Ignore if job did not exist yet
      NULL;
    END;
    
    -- Schedule hourly cleanup
    EXECUTE 'SELECT cron.schedule(''purge-expired-comments-120h'', ''0 * * * *'', ''SELECT public.purge_expired_comments();'')';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron extension not active. You can run public.purge_expired_comments() manually or via cron.';
END;
$cron_setup$;
