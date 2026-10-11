ALTER TABLE public.travel_packages
  ADD COLUMN IF NOT EXISTS short_description TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS best_for TEXT,
  ADD COLUMN IF NOT EXISTS itinerary JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS inclusions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exclusions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS accommodation_details TEXT,
  ADD COLUMN IF NOT EXISTS meal_plan TEXT,
  ADD COLUMN IF NOT EXISTS transport_details TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS gallery TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS available_dates DATE[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT,
  ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;

-- The nine older catalog rows had only card copy. These itineraries are explicitly
-- indicative; inventory and operator terms must be confirmed before payment.
UPDATE public.travel_packages AS p
SET short_description = x.short_description,
    location = x.location,
    best_for = x.best_for,
    itinerary = x.itinerary::jsonb,
    inclusions = x.inclusions,
    exclusions = x.exclusions,
    accommodation_details = x.accommodation_details,
    meal_plan = x.meal_plan,
    transport_details = x.transport_details,
    notes = x.notes,
    gallery = x.gallery,
    cancellation_policy = 'Cancellation charges and deadlines are confirmed in the written quote before payment.',
    terms_and_conditions = 'Sample itinerary only. Final services, dates, availability, pricing, and supplier terms are confirmed in the written quote before payment.'
FROM (VALUES
  ('pkg-national-punjab',
   'Experience Punjabi hospitality, flavorful cuisine, and vibrant countryside traditions.', 'Amritsar and Punjab, India', 'Families, culture lovers, and food travelers',
   '[{"day":"Day 1","title":"Arrive in Amritsar","description":"Check in and explore the local area at leisure."},{"day":"Day 2","title":"Amritsar heritage","description":"Visit the Golden Temple and Jallianwala Bagh; see the Wagah ceremony if timing and access allow."},{"day":"Day 3","title":"Countryside and cuisine","description":"Explore a rural village experience and sample regional Punjabi food."},{"day":"Day 4","title":"Departure","description":"Breakfast, checkout, and onward travel."}]',
   ARRAY['Three nights accommodation, if selected in the confirmed quote','Sightseeing and transfers explicitly listed in the confirmed itinerary','Trip coordination support'],
   ARRAY['Travel to and from Amritsar unless listed','Meals, entry fees, and activities not stated in the confirmed quote','Personal expenses and optional experiences'],
   'Hotel category and room occupancy are confirmed in the written quote.', 'Meal inclusions are confirmed in the written quote.', 'Local transfers only when listed in the confirmed itinerary.', ARRAY['Wagah ceremony timing and access can change; this is a suggested itinerary.'], ARRAY['photo-1609947017136-9daf32a5eb16','photo-1598091383021-15ddea10925d','photo-1524492412937-b28074a5d7da','photo-1599661046827-dacff0c0f09a','photo-1587474260584-136574528ed5']),
  ('pkg-national-amritsar',
   'Discover Amritsar through its sacred landmarks, history, and unforgettable local flavors.', 'Amritsar, Punjab, India', 'Pilgrims, families, and history lovers',
   '[{"day":"Day 1","title":"Arrive and visit the Golden Temple","description":"Check in and visit the Golden Temple, allowing time for the complex and its community kitchen."},{"day":"Day 2","title":"History and local sights","description":"Visit Jallianwala Bagh and explore Amritsar markets; Wagah Border is optional and subject to timing."},{"day":"Day 3","title":"Departure","description":"Breakfast, checkout, and onward travel."}]',
   ARRAY['Two nights accommodation, if selected in the confirmed quote','Sightseeing and transfers explicitly listed in the confirmed itinerary','Trip coordination support'],
   ARRAY['Travel to and from Amritsar unless listed','Meals, donations, entry fees, and activities not stated in the confirmed quote','Personal expenses'],
   'Hotel category and room occupancy are confirmed in the written quote.', 'Meal inclusions are confirmed in the written quote.', 'Local transfers only when listed in the confirmed itinerary.', ARRAY['Religious sites may have visitor, dress, and security requirements.'], ARRAY['photo-1609947017136-9daf32a5eb16','photo-1598091383021-15ddea10925d','photo-1524492412937-b28074a5d7da','photo-1599661046827-dacff0c0f09a','photo-1587474260584-136574528ed5']),
  ('pkg-1',
   'Experience the Swiss Alps with scenic rail journeys, mountain towns, and time to explore at your own pace.', 'Switzerland: route and overnight towns confirmed in quote', 'Scenery lovers, couples, and first-time Switzerland visitors',
   '[{"day":"Day 1","title":"Arrive in Switzerland","description":"Arrive, transfer to the first overnight town, and check in."},{"day":"Day 2","title":"Lakeside and rail journey","description":"Explore the local town and take a scenic train segment if included in the confirmed rail pass."},{"day":"Day 3","title":"Mountain excursion","description":"Enjoy a suggested mountain viewpoint or optional excursion, subject to weather and ticket availability."},{"day":"Day 4","title":"Alpine town transfer","description":"Travel by rail to the next confirmed overnight town and explore at leisure."},{"day":"Day 5","title":"Scenic rail day","description":"Take a planned rail journey and enjoy free time at the destination."},{"day":"Day 6","title":"Leisure and local discovery","description":"Choose an optional excursion or explore independently."},{"day":"Day 7","title":"Departure","description":"Check out and continue to the departure point."}]',
   ARRAY['Six nights accommodation, only as listed in the final quote','Rail tickets or passes only when specified in the final quote','Trip coordination support'],
   ARRAY['International flights unless listed','Meals, mountain excursion tickets, local transit, and attractions unless specified','Visa fees, insurance, and personal expenses'],
   'Hotel locations, category, and occupancy are confirmed in the written quote.', 'Breakfast inclusion is confirmed property by property in the written quote.', 'Rail routes and transfers are confirmed in the written quote.', ARRAY['This is a sample route; rail timetables, mountain access, and weather can affect plans.'], ARRAY['photo-1530789253388-582c481c54b0','photo-1501785888041-af3ef285b470','photo-1464822759023-fed622ff2c3b','photo-1519681393784-d120267933ba','photo-1500534623283-312aade485b7']),
  ('pkg-national-kashmir',
   'Travel through Kashmir valleys, mountain scenery, and Dal Lake on a relaxed suggested route.', 'Srinagar, Gulmarg, and Pahalgam, Kashmir, India', 'Families, couples, and nature travelers',
   '[{"day":"Day 1","title":"Arrive in Srinagar","description":"Transfer to your confirmed stay and enjoy time at leisure."},{"day":"Day 2","title":"Srinagar sights","description":"Explore the city and Mughal gardens; a shikara ride is included only if listed in the quote."},{"day":"Day 3","title":"Gulmarg excursion","description":"Visit Gulmarg subject to weather, road conditions, and local access."},{"day":"Day 4","title":"Pahalgam","description":"Travel to Pahalgam and explore the surroundings at a relaxed pace."},{"day":"Day 5","title":"Return to Srinagar","description":"Return and enjoy remaining time at leisure."},{"day":"Day 6","title":"Departure","description":"Checkout and onward travel."}]',
   ARRAY['Five nights accommodation, only as listed in the final quote','Transfers and sightseeing explicitly listed in the confirmed itinerary','Trip coordination support'],
   ARRAY['Flights or rail tickets unless listed','Gondola, pony rides, shikara, entry fees, meals, and activities unless listed','Personal expenses'],
   'Hotel or houseboat category and room occupancy are confirmed in the written quote.', 'Meal inclusions are confirmed in the written quote.', 'Transfers are limited to the confirmed itinerary.', ARRAY['Mountain excursions and local access depend on weather, road, and safety conditions.'], ARRAY['photo-1595815771614-ade9d652a65d','photo-1519681393784-d120267933ba','photo-1464822759023-fed622ff2c3b','photo-1501785888041-af3ef285b470','photo-1470770841072-f978cf4d019e']),
  ('pkg-national-kerala',
   'Combine Kerala backwaters, hill country, and local culture in a suggested six-day route.', 'Kochi, Munnar, and Kerala backwaters, India', 'Families, couples, and slow-travel seekers',
   '[{"day":"Day 1","title":"Arrive in Kochi","description":"Check in and explore Fort Kochi at leisure."},{"day":"Day 2","title":"Travel to Munnar","description":"Drive through the hills with scenic stops as time and road conditions allow."},{"day":"Day 3","title":"Munnar","description":"Explore tea-growing landscapes and local viewpoints."},{"day":"Day 4","title":"Backwater region","description":"Travel toward the backwaters; boat or houseboat arrangements are included only if listed in the quote."},{"day":"Day 5","title":"Backwater and local life","description":"Enjoy a suggested waterway or village experience, subject to the confirmed plan."},{"day":"Day 6","title":"Departure","description":"Transfer to the confirmed departure point and continue your journey."}]',
   ARRAY['Five nights accommodation, only as listed in the final quote','Transfers and sightseeing explicitly listed in the confirmed itinerary','Trip coordination support'],
   ARRAY['Flights or rail tickets unless listed','Houseboat, meals, entry fees, and activities unless specified','Personal expenses'],
   'Hotel, resort, or houseboat stays are confirmed property by property in the written quote.', 'Meal inclusions vary by stay and are confirmed in the written quote.', 'Intercity and local transfers only when listed in the confirmed itinerary.', ARRAY['Drive times can vary with traffic and weather; the order of stops may change.'], ARRAY['photo-1602216056096-3b40cc0c9944','photo-1540541338287-41700207dee6','photo-1484291470158-b8f8d608850d','photo-1500375592092-40eb2168fd21','photo-1520250497591-112f2f40a3f4']),
  ('pkg-national-goa',
   'Unwind on Goa beaches with coastal food, heritage walks, and flexible time by the sea.', 'Goa, India', 'Friends, couples, and beach holidays',
   '[{"day":"Day 1","title":"Arrive in Goa","description":"Check in and enjoy free time near your stay."},{"day":"Day 2","title":"North Goa coast","description":"Explore selected beaches and coastal viewpoints; exact stops depend on the confirmed plan."},{"day":"Day 3","title":"Heritage and local food","description":"Visit Old Goa heritage sites and browse local markets."},{"day":"Day 4","title":"Leisure day","description":"Enjoy the beach or choose an optional activity at your own expense."},{"day":"Day 5","title":"Departure","description":"Checkout and onward travel."}]',
   ARRAY['Four nights accommodation, only as listed in the final quote','Transfers or sightseeing explicitly listed in the confirmed itinerary','Trip coordination support'],
   ARRAY['Flights or rail tickets unless listed','Meals, water sports, entry fees, and optional activities unless specified','Personal expenses'],
   'Hotel category, location, and room occupancy are confirmed in the written quote.', 'Meal inclusions are confirmed in the written quote.', 'Airport, station, and sightseeing transfers only when listed.', ARRAY['Beach access, water sports, and opening hours depend on weather and operator conditions.'], ARRAY['photo-1512343879784-a960bf40e7f2','photo-1507525428034-b723cf961d3e','photo-1500375592092-40eb2168fd21','photo-1519046904884-53103b34b206','photo-1520250497591-112f2f40a3f4']),
  ('pkg-2',
   'Relax by the Indian Ocean with island time, lagoon views, and optional marine activities.', 'Maldives; resort island confirmed in quote', 'Honeymooners, couples, and beach travelers',
   '[{"day":"Day 1","title":"Arrive in Malé","description":"Meet the arranged transfer and travel to the confirmed island stay."},{"day":"Day 2","title":"Island and lagoon","description":"Settle in and enjoy the beach or lagoon at leisure."},{"day":"Day 3","title":"Optional marine experience","description":"Choose an optional snorkeling or marine excursion, subject to conditions and availability."},{"day":"Day 4","title":"Leisure day","description":"Enjoy resort facilities and island time."},{"day":"Day 5","title":"Departure","description":"Transfer to the departure point and continue your journey."}]',
   ARRAY['Four nights accommodation only at the property and meal plan named in the final quote','Airport-island transfers only if specified in the final quote','Trip coordination support'],
   ARRAY['International flights unless listed','Marine activities, resort taxes, meals, and equipment unless specified','Personal expenses and travel insurance'],
   'Island, room category, and occupancy must be confirmed in the written quote; overwater villas are not guaranteed.', 'The resort meal plan is confirmed in the written quote; all-inclusive is not assumed.', 'Speedboat or seaplane transfers are confirmed in the written quote.', ARRAY['Island transfers and excursions depend on weather and operating schedules.'], ARRAY['photo-1514282401047-d79a71a590e8','photo-1520250497591-112f2f40a3f4','photo-1540541338287-41700207dee6','photo-1507525428034-b723cf961d3e','photo-1519046904884-53103b34b206']),
  ('pkg-3',
   'Discover Japan through city neighborhoods, historic Kyoto, and a suggested intercity rail journey.', 'Tokyo, Kyoto, and Japan; route confirmed in quote', 'Culture seekers, families, and first-time Japan travelers',
   '[{"day":"Day 1","title":"Arrive in Tokyo","description":"Arrive, transfer to your confirmed stay, and rest."},{"day":"Day 2","title":"Tokyo neighborhoods","description":"Explore selected city districts and landmarks."},{"day":"Day 3","title":"Tokyo at your pace","description":"Enjoy a suggested museum, market, or cultural visit."},{"day":"Day 4","title":"Travel to Kyoto","description":"Take the intercity train if included in the confirmed quote."},{"day":"Day 5","title":"Kyoto temples and lanes","description":"Visit selected historic and cultural sites."},{"day":"Day 6","title":"Kyoto local discovery","description":"Explore a garden, market, or nearby district."},{"day":"Day 7","title":"Optional day trip","description":"Choose an optional excursion subject to the confirmed route."},{"day":"Day 8","title":"Return or onward rail","description":"Travel to the next confirmed overnight city."},{"day":"Day 9","title":"Leisure and final sights","description":"Enjoy a flexible day based on the confirmed itinerary."},{"day":"Day 10","title":"Departure","description":"Checkout and transfer to the confirmed departure point."}]',
   ARRAY['Nine nights accommodation only as listed in the final quote','Intercity rail tickets or passes only if specified','Trip coordination support'],
   ARRAY['International flights unless listed','Meals, local transit, attraction tickets, and optional excursions unless specified','Visa fees, insurance, and personal expenses'],
   'Cities, hotel category, and room occupancy are confirmed in the written quote.', 'Meal inclusions are confirmed property by property.', 'Intercity and airport transfers are included only when specified in the written quote.', ARRAY['Suggested route only; rail reservations, seasonal access, and attraction schedules may change.'], ARRAY['photo-1493976040374-85c8e12f0c0e','photo-1540959733332-eab4deabeeaf','photo-1528360983277-13d401cdc186','photo-1513407030348-c983a97b98d8','photo-1522383225653-ed111181a951']),
  ('pkg-national-delhi',
   'Explore Mughal landmarks, lively markets, and the historic heart of India.', 'Delhi, India', 'First-time visitors, families, and history lovers',
   '[{"day":"Day 1","title":"Arrive and explore","description":"Check in and enjoy a suggested Old Delhi market or food walk."},{"day":"Day 2","title":"Heritage landmarks","description":"Visit selected landmarks such as the Red Fort, India Gate, and Qutub Minar, subject to opening schedules."},{"day":"Day 3","title":"Departure","description":"Breakfast, checkout, and onward travel."}]',
   ARRAY['Two nights accommodation, only as listed in the final quote','Sightseeing and transfers explicitly listed in the confirmed itinerary','Trip coordination support'],
   ARRAY['Travel to and from Delhi unless listed','Meals, monument tickets, and activities unless specified','Personal expenses'],
   'Hotel category, location, and room occupancy are confirmed in the written quote.', 'Meal inclusions are confirmed in the written quote.', 'Local transfers only when listed in the confirmed itinerary.', ARRAY['Monument access, traffic, and opening schedules may change the order of visits.'], ARRAY['photo-1587474260584-136574528ed5','photo-1564507592333-c60657eea523','photo-1524492412937-b28074a5d7da','photo-1599661046827-dacff0c0f09a','photo-1519501025264-65ba15a82390'])
) AS x(id, short_description, location, best_for, itinerary, inclusions, exclusions, accommodation_details, meal_plan, transport_details, notes, gallery)
WHERE p.id = x.id;

-- Add the same structured fields and database-backed galleries to the four
-- packages that already have detailed copy in their descriptions.
UPDATE public.travel_packages SET
  short_description = 'A mountain holiday with Himalayan scenery, local sightseeing, and time to explore Manali.',
  location = 'Manali, Himachal Pradesh, India', best_for = 'Families, couples, friends, and first-time mountain travelers',
  itinerary = '[{"day":"Day 1","title":"Arrival in Manali","description":"Arrive, transfer to your hotel, check in, and explore Mall Road at leisure."},{"day":"Day 2","title":"Local sightseeing","description":"Visit Hadimba Temple, Manu Temple, Old Manali, and nearby attractions."},{"day":"Day 3","title":"Solang Valley","description":"Enjoy mountain views and optional seasonal adventure activities."},{"day":"Day 4","title":"Mountain excursion","description":"Take a weather-permitting excursion toward Atal Tunnel and nearby attractions."},{"day":"Day 5","title":"Departure","description":"Breakfast, checkout, and onward travel."}]',
  inclusions = ARRAY['Four nights in standard double-sharing accommodation, subject to confirmation','Daily breakfast as specified','Selected local transfers and sightseeing in the agreed itinerary','Driver and applicable parking charges for the agreed itinerary','Basic trip coordination support'],
  exclusions = ARRAY['Flights, trains, or Volvo bus tickets unless selected','Lunch, dinner, and personal expenses','Adventure activities, entry fees, and special permits unless specified','Room upgrades and early check-in'],
  accommodation_details = 'Standard 3-star-category accommodation, subject to availability and final written confirmation.', meal_plan = 'Daily breakfast as specified in the confirmed itinerary.', transport_details = 'Selected local transfers and sightseeing; final route confirmed before payment.',
  notes = ARRAY['Atal Tunnel and nearby mountain attractions depend on weather and road conditions.'],
  gallery = ARRAY['photo-1530789253388-582c481c54b0','photo-1501785888041-af3ef285b470','photo-1464822759023-fed622ff2c3b','photo-1519681393784-d120267933ba','photo-1506905925346-21bda4d32df4'],
  cancellation_policy = 'Cancellation charges and deadlines are confirmed in the written quote before payment.',
  terms_and_conditions = 'Final services, dates, availability, pricing, and supplier terms are confirmed in the written quote before payment.'
WHERE id = 'pkg-manali-mountain-escape';

UPDATE public.travel_packages SET
  short_description = 'A flexible coastal break with Goa beaches, Portuguese-influenced heritage, and local food.',
  location = 'Goa, India', best_for = 'Couples, friends, families, and short breaks',
  itinerary = '[{"day":"Day 1","title":"Arrival","description":"Arrive, check in, and enjoy leisure time."},{"day":"Day 2","title":"North Goa sightseeing","description":"Explore beaches and Fort Aguada as listed in the confirmed plan."},{"day":"Day 3","title":"Markets and beach time","description":"Explore local markets, relax by the beach, or choose an optional activity."},{"day":"Day 4","title":"Departure","description":"Breakfast, checkout, and onward travel."}]',
  inclusions = ARRAY['Three hotel nights, subject to confirmation','Breakfast as specified','Airport and sightseeing transfers only as specified in the final itinerary'],
  exclusions = ARRAY['Airfare or rail tickets unless stated','Water sports and optional activities','Meals other than those specified','Entry fees and personal expenses'],
  accommodation_details = 'Standard hotel accommodation, subject to availability and final written confirmation.', meal_plan = 'Breakfast only when listed in the confirmed quote.', transport_details = 'Airport and sightseeing transfers only when listed in the confirmed itinerary.',
  notes = ARRAY['Optional water sports depend on operator availability, weather, and safety conditions.'],
  gallery = ARRAY['photo-1512343879784-a960bf40e7f2','photo-1507525428034-b723cf961d3e','photo-1500375592092-40eb2168fd21','photo-1519046904884-53103b34b206','photo-1520250497591-112f2f40a3f4'],
  cancellation_policy = 'Cancellation charges and deadlines are confirmed in the written quote before payment.',
  terms_and_conditions = 'Final services, dates, availability, pricing, and supplier terms are confirmed in the written quote before payment.'
WHERE id = 'pkg-goa-beach-getaway';

UPDATE public.travel_packages SET
  short_description = 'A relaxed Kashmir journey through lakes, gardens, valleys, and mountain scenery.',
  location = 'Srinagar, Gulmarg, and Pahalgam, Kashmir, India', best_for = 'Families, couples, nature lovers, and photographers',
  itinerary = '[{"day":"Day 1","title":"Arrive in Srinagar","description":"Arrive and check in."},{"day":"Day 2","title":"Srinagar sightseeing","description":"Explore Srinagar and selected Mughal gardens."},{"day":"Day 3","title":"Gulmarg","description":"Take a suggested excursion, subject to road and weather conditions."},{"day":"Day 4","title":"Pahalgam","description":"Travel to Pahalgam and explore the surroundings."},{"day":"Day 5","title":"Return to Srinagar","description":"Return and enjoy leisure time."},{"day":"Day 6","title":"Departure","description":"Breakfast, checkout, and onward travel."}]',
  inclusions = ARRAY['Five nights accommodation, as confirmed','Breakfast, if listed in the final quote','Selected transfers and sightseeing in the confirmed itinerary'],
  exclusions = ARRAY['Flights','Gondola tickets, pony rides, and personal expenses','Meals and activities not listed in the confirmed itinerary'],
  accommodation_details = 'Standard hotel or houseboat accommodation only where explicitly confirmed.', meal_plan = 'Meals are confirmed in the written quote.', transport_details = 'Selected transfers and sightseeing as specified in the final itinerary.',
  notes = ARRAY['Dal Lake shikara ride is included only if specified in the confirmed package.','Gulmarg excursions depend on road and weather conditions.'],
  gallery = ARRAY['photo-1595815771614-ade9d652a65d','photo-1519681393784-d120267933ba','photo-1464822759023-fed622ff2c3b','photo-1501785888041-af3ef285b470','photo-1470770841072-f978cf4d019e'],
  cancellation_policy = 'Cancellation charges and deadlines are confirmed in the written quote before payment.',
  terms_and_conditions = 'Final services, dates, availability, pricing, and supplier terms are confirmed in the written quote before payment.'
WHERE id = 'pkg-kashmir-paradise-tour';

UPDATE public.travel_packages SET
  short_description = 'A short Dubai stay combining city landmarks, waterfront districts, and optional desert experiences.',
  location = 'Dubai, United Arab Emirates', best_for = 'Families, couples, friends, and first-time international travelers',
  itinerary = '[{"day":"Day 1","title":"Arrival","description":"Airport pickup only if listed, hotel check-in, and leisure time."},{"day":"Day 2","title":"Dubai city tour","description":"Explore selected city landmarks as detailed in the final itinerary."},{"day":"Day 3","title":"Shopping or optional safari","description":"Browse shopping areas or choose an optional desert safari."},{"day":"Day 4","title":"Leisure and attractions","description":"Enjoy free time or optional attractions."},{"day":"Day 5","title":"Departure","description":"Breakfast, checkout, and airport transfer only if confirmed."}]',
  inclusions = ARRAY['Four nights accommodation as confirmed','Breakfast if stated in the written quote','Selected transfers and sightseeing specified in the final itinerary'],
  exclusions = ARRAY['International flights unless stated','Visa fees and travel insurance','Attraction tickets not specified','Optional tours and personal expenses'],
  accommodation_details = 'Hotel and room category are confirmed in the written quote.', meal_plan = 'Breakfast only when listed in the confirmed quote.', transport_details = 'Airport transfers and sightseeing transfers only as specified in the final itinerary.',
  notes = ARRAY['Passport validity, visa eligibility, and entry requirements must be checked before booking.'],
  gallery = ARRAY['photo-1512453979798-5ea266f8880c','photo-1589287045688-5ace6419b16e','photo-1519501025264-65ba15a82390','photo-1480714378408-67cf0d13bc1b','photo-1512632578888-169bbbc64f33'],
  cancellation_policy = 'Cancellation charges and deadlines are confirmed in the written quote before payment.',
  terms_and_conditions = 'Final services, dates, availability, pricing, visa responsibilities, and supplier terms are confirmed in the written quote before payment.'
WHERE id = 'pkg-dubai-city-experience';

UPDATE public.travel_packages AS p
SET gallery = ARRAY(
  SELECT 'https://images.unsplash.com/' || image_id || '?auto=format&fit=crop&w=1600&q=85'
  FROM unnest(p.gallery) AS image_id
)
WHERE cardinality(p.gallery) > 0;
