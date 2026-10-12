-- Holiday packages transcribed from the supplied Lemon Trip package brief.
-- IDs are stable, and conflicts are ignored so rerunning this file won't
-- overwrite edits to existing packages.
INSERT INTO public.travel_packages (
  id, destination, duration, description, starting_price, highlights,
  image_fallback_color, image_url, category, price_amount, currency
)
VALUES
  (
    'pkg-manali-mountain-escape',
    'Manali Mountain Escape',
    '5 Days, 4 Nights',
    $pkg$
Overview
Experience the beauty of the Himalayas with scenic mountain drives, pine forests, peaceful temples and adventure activities. This package is ideal for couples, families and groups looking for a refreshing mountain holiday.

Location: Manali, Himachal Pradesh.
Price: INR 12,999 per person.
Best for: Families, couples, friends and first-time mountain travellers.

Day-wise itinerary
Day 1 — Arrival in Manali: Arrive, transfer to your hotel, check in and explore Mall Road at leisure.
Day 2 — Local sightseeing: Visit Hadimba Temple, Manu Temple, Old Manali and nearby attractions.
Day 3 — Solang Valley: Enjoy mountain views and optional seasonal adventure activities.
Day 4 — Mountain excursion: Take a weather-permitting excursion toward Atal Tunnel and nearby attractions.
Day 5 — Departure: Enjoy breakfast, check out and depart for your onward journey.

What's included
- 4 nights in a standard double-sharing hotel room.
- Daily breakfast.
- Selected local transfers and sightseeing.
- Driver and applicable parking charges for the agreed itinerary.
- Basic trip coordination support.

Not included
- Flights, trains or Volvo bus tickets unless specifically selected.
- Lunch, dinner and personal expenses.
- Adventure activities, entry fees and special permits unless specified.
- Room upgrades and early check-in.

Stay details: Standard 3-star-category accommodation, subject to availability.
Additional notes: Atal Tunnel and nearby mountain attractions are subject to weather and road conditions.
$pkg$,
    'From INR 12,999 / person',
    ARRAY[
      'Explore Hadimba Devi Temple and Old Manali',
      'Panoramic views around Solang Valley',
      'Atal Tunnel or nearby attractions, weather and road conditions permitting',
      'Local cafés, markets and Himachali culture',
      'Comfortable accommodation and sightseeing transfers'
    ],
    'bg-[var(--color-secondary-soft)]',
    NULL,
    'national',
    12999,
    'INR'
  ),
  (
    'pkg-goa-beach-getaway',
    'Goa Beach Getaway',
    '4 Days, 3 Nights',
    $pkg$
Overview
Enjoy a relaxing beach holiday with coastal views, Portuguese-influenced architecture, local food, vibrant markets and optional water activities.

Location: Goa, India.
Price: INR 10,499 per person.
Best for: Couples, friends, families and short breaks.

Itinerary
Day 1: Arrival, hotel check-in and leisure time.
Day 2: North Goa sightseeing, beaches and Fort Aguada.
Day 3: Explore local markets, enjoy the beach or select optional activities.
Day 4: Breakfast, checkout and departure.

Included: 3 hotel nights, breakfast, airport transfers and sightseeing transfers as specified in the final itinerary.
Excluded: Airfare, water sports, meals other than those specified, entry fees and personal expenses.
Stay details: Standard hotel accommodation, subject to availability.
Additional notes: Optional water sports depend on operator availability and safety conditions.
$pkg$,
    'From INR 10,499 / person',
    ARRAY[
      'Explore North Goa beaches and coastal attractions',
      'Visit Fort Aguada and nearby viewpoints',
      'Discover local markets and beachside cafés',
      'Free time for swimming, relaxation and photography',
      'Optional water sports, subject to operator availability and safety conditions'
    ],
    'bg-[var(--color-accent-soft)]',
    NULL,
    'national',
    10499,
    'INR'
  ),
  (
    'pkg-kashmir-paradise-tour',
    'Kashmir Paradise Tour',
    '6 Days, 5 Nights',
    $pkg$
Overview
Discover Kashmir's lakes, valleys, gardens and mountain scenery through a relaxed sightseeing holiday with selected excursions.

Location: Srinagar, Gulmarg and Pahalgam.
Price: INR 19,999 per person.
Best for: Families, couples, nature lovers and photographers.

Itinerary
Day 1: Arrive in Srinagar and check in.
Day 2: Srinagar sightseeing and Mughal gardens.
Day 3: Excursion to Gulmarg, subject to road and weather conditions.
Day 4: Travel to Pahalgam and explore the surroundings.
Day 5: Return to Srinagar and enjoy leisure time.
Day 6: Breakfast, checkout and departure.

Included: 5 nights' accommodation, breakfast, selected transfers and sightseeing.
Excluded: Flights, gondola tickets, pony rides, personal expenses and any meals or activities not listed in the confirmed itinerary.
Stay details: Standard hotel or houseboat accommodation only where explicitly confirmed.
Additional notes: A Dal Lake shikara ride is included only if specified in the confirmed package. Gulmarg excursions depend on road and weather conditions.
$pkg$,
    'From INR 19,999 / person',
    ARRAY[
      'Dal Lake shikara ride, if included in the confirmed package',
      'Srinagar Mughal gardens',
      'Gulmarg mountain scenery',
      'Pahalgam riverside landscapes',
      'Local Kashmiri cuisine and handicraft markets'
    ],
    'bg-[var(--color-primary-soft)]',
    NULL,
    'national',
    19999,
    'INR'
  ),
  (
    'pkg-dubai-city-experience',
    'Dubai City Experience',
    '5 Days, 4 Nights',
    $pkg$
Overview
Explore Dubai's modern skyline, waterfront districts, shopping destinations and desert landscapes in a convenient short international holiday.

Location: Dubai, United Arab Emirates.
Price: INR 39,999 per person.
Best for: Families, couples, friends and first-time international travellers.

Itinerary
Day 1: Airport pickup, hotel check-in and leisure time.
Day 2: Dubai city tour and selected landmarks.
Day 3: Shopping or optional desert safari.
Day 4: Leisure day with optional attractions.
Day 5: Breakfast, checkout and airport transfer.

Included: 4 nights' accommodation, breakfast, selected transfers and the sightseeing specified in the final itinerary.
Excluded: International flights unless stated, visa fees, travel insurance, attraction tickets not specified, optional tours and personal expenses.
Important: Passport validity, visa eligibility and entry requirements must be verified before booking.
$pkg$,
    'From INR 39,999 / person',
    ARRAY[
      'Explore Dubai Marina and popular city landmarks',
      'Visit traditional markets and modern shopping areas',
      'Optional desert safari with entertainment and dinner',
      'Optional Burj Khalifa observation deck visit',
      'Contemporary architecture and Emirati culture'
    ],
    'bg-[var(--color-secondary-soft)]',
    NULL,
    'international',
    39999,
    'INR'
  )
ON CONFLICT (id) DO NOTHING;
