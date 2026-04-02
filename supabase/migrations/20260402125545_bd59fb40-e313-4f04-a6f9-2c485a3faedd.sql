ALTER TABLE public.links_curtos ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE public.links_curtos ADD COLUMN IF NOT EXISTS bucket_name TEXT DEFAULT 'processo-anexos';