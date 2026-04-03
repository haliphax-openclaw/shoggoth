-- Add context_level column to cron_jobs for per-job context level override.
-- NULL means "not explicitly set" and falls back to resolved agent config at runtime.
ALTER TABLE cron_jobs ADD COLUMN context_level TEXT DEFAULT NULL;
