ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION set_blog_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS blog_posts_set_updated_at ON blog_posts;
CREATE TRIGGER blog_posts_set_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION set_blog_posts_updated_at();

INSERT INTO blog_posts (
  id, category, title, excerpt, content, image_fallback_color,
  image_url, published_at, read_time, updated_at
)
VALUES
  (
    'blog-1', 'Travel Tips', 'Beach Packing for 2026: A Practical Checklist',
    'Pack for sun, sand and changing plans with a simple checklist for beach days, health essentials and airline rules.',
    $$A beach trip is easier when the essentials are easy to reach. Start with swimwear, a light cover-up, sandals that can get wet, a dry change of clothes and a reusable water bottle. Add a small waterproof pouch for your phone and documents, plus a light bag for wet items on the journey home.

Protect your health as carefully as your luggage. Pack broad-spectrum sunscreen, sunglasses, a brimmed hat and light protective clothing. Sun can still be strong on cloudy days, and water and sand reflect it. Follow the product label for sunscreen reapplication, and use shade during the strongest sun hours. Bring regular medicines, a small first-aid kit and insect repellent suited to your destination.

Before leaving, check local weather, beach flags and swimming guidance. Conditions can change quickly, and a red or restricted-beach notice matters more than a holiday plan. If you are travelling internationally, check destination-specific health advice and whether your sunscreen or other products meet local environmental rules.

Keep travel documents, medication and valuables in your personal item. Airline rules for liquids, batteries and sports equipment vary, so confirm the current rules with your carrier before packing. For current health planning, see [CDC travel health guidance](https://www.cdc.gov/summer-travel/travel-safely/index.html), [CDC sun exposure advice](https://wwwnc.cdc.gov/travel/page/sun-exposure) and the beach’s local safety notices.$$,
    'bg-[var(--color-primary-soft)]', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=900&q=85',
    DATE '2026-10-11', '3 min read', NOW()
  ),
  (
    'blog-2', 'Destinations', 'Europe Beyond the Usual Capitals: Ideas for 2026',
    'Build a slower European itinerary around smaller cities, local transport and time to explore beyond the main sights.',
    $$A memorable Europe trip does not need a new city every morning. Choose one or two bases and leave room for neighbourhood walks, markets and day trips. Smaller cities can make a useful counterpoint to a busy capital: consider Ghent for its canals and historic centre, Ljubljana for an easy-going riverside break, or Coimbra for university history and hillside lanes.

Treat these as starting points, not a checklist. Look at the travel time between places before booking, and compare rail, coach and regional services using the operators’ current timetables. Some popular sights require timed entry, while local museums and restaurants may close on particular days. Check official visitor information close to your dates rather than relying on an old blog post.

When choosing accommodation, check how far it is from public transport and whether a late arrival is practical. Book the first and last nights around your actual arrival and departure times. Keep one unscheduled afternoon in each base; it gives you room for weather changes and the discoveries that make a trip feel personal.

For border requirements, visa rules and entry procedures, use the official government information for each country. Requirements can change, and a multi-country itinerary may affect which consulate handles a visa application. For transport, use the current national rail or coach operator timetable before paying for a connection.$$,
    'bg-[var(--color-secondary-soft)]', 'https://images.unsplash.com/photo-1500534623283-312aade485b7?w=900&q=85',
    DATE '2026-10-11', '3 min read', NOW()
  ),
  (
    'blog-3', 'Visa Guide', 'Schengen Travel in 2026: What Indian Travellers Should Check',
    'A current planning guide to Schengen visa timing, the Entry/Exit System and the separate ETIAS rollout.',
    $$Start with the official visa page of the country that is your main destination. If you will spend the most time in one Schengen country, apply through that country’s consulate; if stays are equal, the first country you visit generally handles the application. The European Commission says applications should be submitted at least 15 days before travel and no earlier than six months beforehand. Appointment availability and document requirements vary by country, so begin early and follow the consulate’s checklist.

For Indian citizens travelling to the Schengen area for a short stay, a visa is required. The EU’s Entry/Exit System (EES) is now fully operational across Schengen countries. At the external border, the system records entry and exit information and collects facial images and fingerprints from covered travellers. Allow time for border procedures and follow instructions from border staff.

ETIAS is a different system. As of the latest official information checked on 11 October 2026, it is scheduled to start in the last quarter of 2026. ETIAS is for visa-exempt travellers; the European Commission says Indian citizens who need a Schengen visa do not need ETIAS. Do not pay a third-party site claiming to submit an ETIAS application before the official system opens.

Use official sources close to your departure because implementation dates and local procedures can change: [European Commission visa application guidance](https://home-affairs.ec.europa.eu/policies/schengen/visa-policy/applying-schengen-visa_en), [EES and ETIAS information](https://home-affairs.ec.europa.eu/news/main-differences-between-ees-and-etias-what-travellers-need-know-2026-04-28_en), and [official ETIAS status](https://travel-europe.europa.eu/etias).$$,
    'bg-[var(--color-accent-soft)]', 'https://images.unsplash.com/photo-1526772662000-3f88f10405ff?w=900&q=85',
    DATE '2026-10-11', '4 min read', NOW()
  ),
  (
    'blog-4', 'Budget Travel', 'How to Build a Realistic India Travel Budget in 2026',
    'Plan transport, stays, meals and activities with current prices instead of relying on an outdated one-size-fits-all daily budget.',
    $$A useful India travel budget starts with your route and dates, not a fixed promise that a whole trip can cost the same amount each day. Prices vary by city, season, travel time and comfort level. A festival weekend, a remote transfer or a last-minute booking can change the total substantially.

Price the largest items first: intercity transport, accommodation and any permits or booked activities. Check current fares with the official transport operator, then compare a flexible ticket with the cheapest restricted option. For stays, include taxes, breakfast, location and cancellation terms before comparing nightly rates.

Next, set a daily allowance for local travel, meals and small purchases. Use recent menus and local transport fares where available, and add a buffer for taxis, weather changes or a missed connection. Keep emergency money separate from the amount you expect to spend. If you are visiting several regions, make a different estimate for each leg instead of averaging away expensive travel days.

Track planned and paid costs in one note or spreadsheet. Recheck prices before booking because listings can change, and never treat an old article’s rupee amount as a current quote. This approach gives you a budget you can adjust while keeping the experiences that matter most.$$,
    'bg-[var(--color-primary-soft)]', 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=900&q=85',
    DATE '2026-10-11', '3 min read', NOW()
  ),
  (
    'blog-5', 'Travel Tips', 'A Lighter Business Travel Packing Plan for 2026',
    'A compact work-trip checklist for clothes, devices, documents and the small essentials that prevent avoidable delays.',
    $$Pack around the meetings and the weather, not a hypothetical week. Choose a small set of clothes that work together, then check the dress code and forecast before adding extras. Wear the bulkiest shoes in transit and keep one neat layer accessible for a meeting straight after arrival.

Make one work pouch for chargers, adapters, earphones and a spare cable. Keep your laptop and the items needed at security easy to reach. Carry a power bank and other restricted electronics according to the current rules of your airline and departure airport; requirements differ by carrier and route.

Keep identification, booking details, medication and anything difficult to replace in your personal item. Save offline copies of the itinerary and meeting address, and keep a short list of important contacts. If you are crossing borders, check passport validity, entry requirements and any work-visa rules for the destination—business meetings do not automatically make every activity permissible as a visitor.

Before you close the bag, remove items you can obtain easily at your destination. A quick check of airline baggage limits and the hotel’s available amenities is more reliable than packing for every possibility. The goal is to arrive prepared, with enough flexibility for a delayed connection or an extra night.$$,
    'bg-[var(--color-secondary-soft)]', 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=900&q=85',
    DATE '2026-10-11', '3 min read', NOW()
  ),
  (
    'blog-6', 'Destinations', 'India in October and November: Hill and Nature Escapes',
    'Choose an autumn getaway by checking regional weather, road access and local conditions before you book.',
    $$October and November can be rewarding months for nature trips, but India’s weather does not change everywhere at once. The national tourism portal describes September to November as the monsoon season, so conditions can still include rain in some regions. Check the local forecast and current advisories for the exact district and travel dates rather than assuming that the season is settled.

For a Western Ghats break, Igatpuri pairs green hill scenery with access from the Mumbai–Nashik corridor. The official Incredible India guide lists October to February among its winter visiting months. In Uttarakhand, Kausani is another mountain option; the official destination guide describes October to February as a period for crisp air and winter views. These seasonal descriptions are planning guidance, not a guarantee of clear roads or safe trails on a particular day.

Build a flexible itinerary. Confirm road status with local authorities, reserve accommodation with a clear change policy, and avoid starting unfamiliar mountain routes late in the day. Pack a light rain layer, warm clothing for evenings and shoes suited to the activities you have actually booked. Keep a slower alternative ready in case rain or a local closure changes the plan.

Check current conditions with the [India Meteorological Department](https://mausamgram.imd.gov.in/) and consult [Incredible India’s seasonal guide](https://www.incredibleindia.gov.in/en/plan-your-trip/weather), [Igatpuri guide](https://www.incredibleindia.gov.in/en/maharashtra/igatpuri) and [Kausani guide](https://www.incredibleindia.gov.in/en/uttarakhand/kausani) before setting out.$$,
    'bg-[var(--color-accent-soft)]', 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=900&q=85',
    DATE '2026-10-11', '3 min read', NOW()
  )
ON CONFLICT (id) DO UPDATE SET
  category = EXCLUDED.category,
  title = EXCLUDED.title,
  excerpt = EXCLUDED.excerpt,
  content = EXCLUDED.content,
  image_fallback_color = EXCLUDED.image_fallback_color,
  image_url = EXCLUDED.image_url,
  read_time = EXCLUDED.read_time,
  updated_at = NOW();
