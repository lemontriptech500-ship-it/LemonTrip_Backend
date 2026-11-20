ALTER TABLE travel_bookings DROP CONSTRAINT IF EXISTS travel_bookings_item_type_check;
ALTER TABLE travel_bookings ADD CONSTRAINT travel_bookings_item_type_check
  CHECK (item_type IN ('hotel', 'bus', 'train', 'package', 'cab'));
