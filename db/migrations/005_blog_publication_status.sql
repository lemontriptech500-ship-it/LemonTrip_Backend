-- Preserve current public visibility for existing rows. Admins can later
-- explicitly move a post to draft; public APIs only return 'published'.
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS publication_status VARCHAR(20) NOT NULL DEFAULT 'published';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'blog_posts'::regclass
      AND conname = 'blog_posts_publication_status_check'
  ) THEN
    ALTER TABLE blog_posts
      ADD CONSTRAINT blog_posts_publication_status_check
      CHECK (publication_status IN ('draft', 'published')) NOT VALID;
  END IF;
END $$;

ALTER TABLE blog_posts
  VALIDATE CONSTRAINT blog_posts_publication_status_check;

CREATE INDEX IF NOT EXISTS idx_blog_posts_published_public
  ON blog_posts (published_at DESC, created_at DESC)
  WHERE publication_status = 'published';
