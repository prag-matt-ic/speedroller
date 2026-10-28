-- Apply before deploying palette-aware leaderboard reads and submissions.
ALTER TABLE speedroller
  ADD COLUMN IF NOT EXISTS palette_index SMALLINT
  CHECK (palette_index BETWEEN 0 AND 7);
