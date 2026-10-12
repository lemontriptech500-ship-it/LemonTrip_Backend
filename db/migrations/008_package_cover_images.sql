-- Older package rows have gallery photos but no card/cover URL. Use the first
-- gallery photo as the cover so clients that consume image_url can render it.
UPDATE public.travel_packages
SET image_url = gallery[1]
WHERE (image_url IS NULL OR btrim(image_url) = '')
  AND cardinality(gallery) > 0
  AND gallery[1] IS NOT NULL
  AND btrim(gallery[1]) <> '';
