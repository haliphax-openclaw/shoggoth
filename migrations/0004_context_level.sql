-- Add context_level column to sessions for graduated context control.
-- NULL means "not explicitly set" and defaults to "full" at runtime.
ALTER TABLE sessions ADD COLUMN context_level TEXT DEFAULT NULL;
