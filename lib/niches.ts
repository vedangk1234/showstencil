/**
 * lib/niches.ts
 *
 * Canonical ShowStencil taxonomy — every top-level niche and every sub-niche
 * the product recognises.
 *
 * Source file:   C:\Users\vedan\Desktop\showstencil\Niche.txt
 * Total niches:  31 top-level entries
 * Total subs:    400 sub-niches across all parents
 *
 * THIS FILE IS THE SINGLE SOURCE OF TRUTH for niche identification across
 * the entire codebase. No other file should hardcode niche slugs, niche
 * display names, sub-niche lists, or per-niche search queries. All niche-
 * related logic must import from here.
 *
 * Slug rules (applied uniformly to every entry below):
 *   - lowercase ASCII
 *   - words separated by underscores
 *   - apostrophes are stripped entirely (e.g. "Children's" → "childrens")
 *   - "&" / "and" / commas / slashes / hyphens collapse to a single "_"
 *   - "(U.S.)" suffix becomes a trailing "_us"
 *   - other parenthetical content is dropped from the slug entirely
 *     (e.g. "Performing Arts (Music, Theater, Dance)" → "performing_arts").
 *     The full display name is preserved as-is.
 *   - sub-niches whose bare name would collide with a top-level niche slug —
 *     or with another sub-niche under a different parent that would cause
 *     real confusion — are prefixed with the parent slug. Examples:
 *       Podcast → "Music"     becomes "podcast_music"
 *       Product Reviews → "Automotive" becomes "product_reviews_automotive"
 *
 * Every slug across the entire taxonomy is globally unique. A runtime
 * invariant check at module load (assertTaxonomyInvariants) throws if this
 * is ever violated by a future edit.
 *
 * This file has zero internal dependencies — it must remain safely
 * importable from any other file in the project.
 */

// -----------------------------------------------------------------------------
// Slug union — the single source of truth for valid top-level niche slugs.
// Every NicheDefinition below must use a slug from this list, enforced both
// at compile time (via the typed niche() helper) and at runtime (via
// assertTaxonomyInvariants).
// -----------------------------------------------------------------------------

export const VALID_NICHE_SLUGS = [
  'animals',
  'arts_culture',
  'automotive',
  'beauty_makeup',
  'business_startups',
  'ecommerce',
  'education',
  'entertainment_comedy',
  'fashion',
  'finance_crypto',
  'fitness',
  'food_drink_cooking',
  'gaming',
  'health',
  'home_diy',
  'humanities',
  'magic_paranormal',
  'motivation_self_improvement',
  'music',
  'nature_outdoors',
  'news_politics',
  'news_politics_us',
  'podcast',
  'product_reviews',
  'relationships_family',
  'sales_marketing',
  'social_media',
  'sports',
  'tech_ai_software',
  'travel',
  'video_essays',
] as const;

export type ValidNicheSlug = typeof VALID_NICHE_SLUGS[number];

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SubNiche {
  /** Globally unique slug across the entire taxonomy. */
  readonly slug: string;
  /** Human-readable name shown in the UI. */
  readonly displayName: string;
  /** Slug of the parent top-level niche. Always references an entry in NICHES. */
  readonly parentSlug: ValidNicheSlug;
}

export interface NicheDefinition {
  /** Globally unique top-level slug. */
  readonly slug: ValidNicheSlug;
  /** Human-readable name shown in the UI. */
  readonly displayName: string;
  /** Ordered list of sub-niches that belong to this top-level niche. */
  readonly subNiches: readonly SubNiche[];
  /**
   * The canonical, US-English YouTube search phrase a creator in this niche
   * would type. Used by competitor auto-detection. Pick natural language
   * that returns diverse, real channels — not narrow jargon.
   */
  readonly searchQuery: string;
}

// -----------------------------------------------------------------------------
// Helper used internally to build each niche block tersely. The parentSlug on
// every SubNiche is filled in automatically from the enclosing niche slug.
// Constraining `slug` to ValidNicheSlug catches typos at compile time.
// -----------------------------------------------------------------------------

function niche(
  slug: ValidNicheSlug,
  displayName: string,
  searchQuery: string,
  subs: ReadonlyArray<readonly [slug: string, displayName: string]>,
): NicheDefinition {
  return {
    slug,
    displayName,
    searchQuery,
    subNiches: subs.map(([s, d]) => ({ slug: s, displayName: d, parentSlug: slug })),
  };
}

// -----------------------------------------------------------------------------
// The taxonomy
// -----------------------------------------------------------------------------

export const NICHES: readonly NicheDefinition[] = [
  niche('animals', 'Animals', 'pets and animal care', [
    ['animal_behavior_training',        'Animal Behavior & Training'],
    ['animal_rescue_adoption_welfare',  'Animal Rescue, Adoption & Welfare'],
    ['bees_and_wasps',                  'Bees and Wasps'],
    ['cats_dogs',                       'Cats & Dogs'],
    ['farm_domesticated_animals',       'Farm & Domesticated Animals'],
    ['horses',                          'Horses'],
    ['pet_industry_products',           'Pet Industry & Products'],
    ['small_exotic_pets',               'Small & Exotic Pets'],
    ['veterinary_animal_health',        'Veterinary & Animal Health'],
    ['wildlife_conservation',           'Wildlife & Conservation'],
  ]),

  niche('arts_culture', 'Arts & Culture', 'art and culture', [
    ['architecture_design',             'Architecture & Design'],
    ['art_history_cultural_heritage',   'Art History & Cultural Heritage'],
    ['art_tutorials_education',         'Art Tutorials & Education'],
    ['comics_cartoons_animation',       'Comics, Cartoons & Animation'],
    ['contemporary_modern_art',         'Contemporary & Modern Art'],
    ['cultural_studies_anthropology',   'Cultural Studies & Anthropology'],
    ['literature_poetry_writing',       'Literature, Poetry & Writing'],
    ['performing_arts',                 'Performing Arts (Music, Theater, Dance)'],
    ['photography_filmmaking',          'Photography & Filmmaking'],
    ['visual_arts',                     'Visual Arts (Painting, Sculpture, Drawing)'],
  ]),

  niche('automotive', 'Automotive', 'cars and automotive', [
    ['automotive_news_industry_insights',  'Automotive News & Industry Insights'],
    ['automotive_technology_innovations',  'Automotive Technology & Innovations'],
    ['car_buying_guides_ownership_tips',   'Car Buying Guides & Ownership Tips'],
    ['car_maintenance_repair',             'Car Maintenance & Repair'],
    ['car_modifications_customization',    'Car Modifications & Customization'],
    ['car_reviews_test_drives',            'Car Reviews & Test Drives'],
    ['classic_vintage_cars',               'Classic & Vintage Cars'],
    ['driving_tips_road_safety',           'Driving Tips & Road Safety'],
    ['electric_hybrid_vehicles',           'Electric & Hybrid Vehicles'],
    ['motorcycle_reviews_riding',          'Motorcycle Reviews & Riding'],
    ['motorsports_racing',                 'Motorsports & Racing'],
    ['off_roading_adventure_vehicles',     'Off-Roading & Adventure Vehicles'],
  ]),

  niche('beauty_makeup', 'Beauty & Makeup', 'beauty and makeup tutorials', [
    ['barbers_hair_professionals',  'Barbers & Hair Professionals'],
    ['beauty_bloggers',             'Beauty Bloggers'],
    ['beauty_industry',             'Beauty Industry'],
    ['beauty_trends',               'Beauty Trends'],
    ['cosmetic_surgery',            'Cosmetic Surgery'],
    ['fragrance_perfume',           'Fragrance & Perfume'],
    ['get_ready_with_me',           'Get Ready With Me (GRWM)'],
    ['hair_care',                   'Hair Care'],
    ['make_up_tutorials',           'Make Up & Tutorials'],
    ['mens_grooming',               "Men's Grooming"],
    ['nail_art_manicure',           'Nail Art / Manicure'],
    ['natural_organic_beauty',      'Natural & Organic Beauty'],
    ['skincare',                    'Skincare'],
  ]),

  niche('business_startups', 'Business & Startups', 'business and startups', [
    ['building_scaling_online_businesses',  'Building & Scaling Online Businesses'],
    ['business_coaching_consulting',        'Business Coaching & Consulting'],
    ['business_law_legal_advice',           'Business Law & Legal Advice'],
    ['business_models',                     'Business Models'],
    ['ceos_leaders',                        'CEOs & Leaders'],
    ['corporate_culture',                   'Corporate Culture'],
    ['corporate_finance',                   'Corporate Finance'],
    ['digital_nomads',                      'Digital Nomads'],
    ['freelancing',                         'Freelancing'],
    ['human_resources_recruitment',         'Human Resources & Recruitment'],
    ['innovation_change_management',        'Innovation & Change Management'],
    ['office_remote_work',                  'Office & Remote Work'],
    ['productivity',                        'Productivity'],
    ['project_management',                  'Project Management'],
    ['startups_entrepreneurship',           'Startups & Entrepreneurship'],
    ['venture_capital_funding',             'Venture Capital & Funding'],
  ]),

  niche('ecommerce', 'E-commerce & Online Business', 'ecommerce and online business', [
    ['amazon_fba',                            'Amazon FBA'],
    ['d2c_brands',                            'D2C Brands'],
    ['dropshipping',                          'Dropshipping'],
    ['ecommerce_technology_tools',            'E-commerce Technology & Tools'],
    ['handmade_artisan_marketplaces',         'Handmade & Artisan Marketplaces'],
    ['print_on_demand_businesses',            'Print-on-Demand Businesses'],
    ['product_sourcing_inventory_management', 'Product Sourcing & Inventory Management'],
    ['shopify',                               'Shopify'],
  ]),

  niche('education', 'Education', 'education and learning', [
    ['arts_creative_education',                  'Arts & Creative Education'],
    ['educational_documentary',                  'Educational & Documentary'],
    ['educational_entertainment',                'Educational Entertainment (Edutainment)'],
    ['humanities_social_sciences_education',     'Humanities & Social Sciences Education'],
    ['language_learning',                        'Language Learning'],
    ['online_courses_e_learning_platforms',      'Online Courses & E-Learning Platforms'],
    ['special_education_learning_disabilities',  'Special Education & Learning Disabilities'],
    ['stem_education',                           'STEM Education'],
    ['teaching_classroom_resources',             'Teaching & Classroom Resources'],
    ['test_preparation_study_tips',              'Test Preparation & Study Tips'],
  ]),

  niche('entertainment_comedy', 'Entertainment & Comedy', 'comedy and entertainment', [
    ['animation_cartoons',      'Animation & Cartoons'],
    ['asmr',                    'ASMR'],
    ['childrens_entertainment', "Children's Entertainment"],
    ['comedy_sketches',         'Comedy & Sketches'],
    ['humor_satire',            'Humor & Satire'],
    ['movies_tv_reviews',       'Movies & TV Reviews'],
    ['music_performances',      'Music Performances'],
    ['pranks_challenges',       'Pranks & Challenges'],
    ['reaction_videos',         'Reaction Videos'],
    ['tv_web_series',           'TV & Web Series'],
    ['vlogs_daily_life',        'Vlogs & Daily Life'],
  ]),

  niche('fashion', 'Fashion', 'fashion and style', [
    ['accessories_footwear',              'Accessories & Footwear'],
    ['fashion_design_diy_projects',       'Fashion Design & DIY Projects'],
    ['fashion_hauls_try_ons',             'Fashion Hauls & Try-Ons'],
    ['fashion_industry_modeling',         'Fashion Industry & Modeling'],
    ['mens_fashion',                      "Men's Fashion"],
    ['outfit_inspiration_styling_tips',   'Outfit Inspiration & Styling Tips'],
    ['sustainable_ethical_fashion',       'Sustainable & Ethical Fashion'],
  ]),

  niche('finance_crypto', 'Finance & Cryptocurrency', 'personal finance and crypto', [
    ['accounting_taxation',           'Accounting & Taxation'],
    ['altcoins',                      'Altcoins'],
    ['bitcoin_ethereum',              'Bitcoin & Ethereum'],
    ['blockchain_technology',         'Blockchain Technology'],
    ['cryptocurrency',                'Cryptocurrency'],
    ['economic_analysis_news',        'Economic Analysis & News'],
    ['financial_education_literacy',  'Financial Education & Literacy'],
    ['fintech',                       'Fintech'],
    ['forex',                         'Forex'],
    ['insurance',                     'Insurance'],
    ['investing_financial_markets',   'Investing & Financial Markets'],
    ['nfts',                          'NFTs'],
    ['personal_finance',              'Personal Finance'],
    ['real_estate_investing',         'Real Estate Investing'],
    ['retirement_planning',           'Retirement Planning'],
    ['wealth_management',             'Wealth Management'],
    ['web3',                          'Web3'],
  ]),

  niche('fitness', 'Fitness', 'fitness and workouts', [
    ['beginner_fitness',                  'Beginner Fitness'],
    ['body_weight_challenge',             'Body Weight Challenge'],
    ['crossfit_workouts',                 'CrossFit Workouts'],
    ['endurance_training',                'Endurance Training'],
    ['fitness_challenge',                 'Fitness Challenge'],
    ['fitness_gear_reviews',              'Fitness Gear Reviews'],
    ['gym_workouts',                      'Gym Workouts'],
    ['hiit',                              'HIIT'],
    ['home_workouts',                     'Home Workouts'],
    ['martial_arts',                      'Martial Arts'],
    ['nutrition_supplements',             'Nutrition & Supplements'],
    ['running',                           'Running'],
    ['weight_loss_body_transformation',   'Weight Loss & Body Transformation'],
    ['yoga_pilates_barre',                'Yoga, Pilates & Barre'],
  ]),

  niche('food_drink_cooking', 'Food, Drink & Cooking', 'cooking and recipes', [
    ['alcohol_wine_spirits',                'Alcohol, Wine & Spirits'],
    ['baking_desserts',                     'Baking & Desserts'],
    ['food_challenges_competitive_eating',  'Food Challenges & Competitive Eating'],
    ['food_reviews_mukbangs',               'Food Reviews & Mukbangs'],
    ['food_science_education',              'Food Science & Education'],
    ['nutrition_healthy_eating',            'Nutrition & Healthy Eating'],
    ['recipes_cooking_tutorials',           'Recipes & Cooking Tutorials'],
    ['restaurant_street_food_vlogs',        'Restaurant & Street Food Vlogs'],
    ['vegan_vegetarian_cooking',            'Vegan & Vegetarian Cooking'],
    ['world_ethnic_cuisines',               'World & Ethnic Cuisines'],
  ]),

  niche('gaming', 'Gaming', 'gaming', [
    ['action_adventure_games',          'Action & Adventure Games'],
    ['apex_legends',                    'Apex Legends'],
    ['call_of_duty',                    'Call Of Duty'],
    ['deltarune',                       'Deltarune'],
    ['esports_competitive_gaming',      'Esports & Competitive Gaming'],
    ['fifa',                            'Fifa'],
    ['fortnite',                        'Fortnite'],
    ['game_reviews',                    'Game Reviews'],
    ['game_reviews_previews',           'Game Reviews & Previews'],
    ['game_streaming_lets_plays',       "Game Streaming & Let's Plays"],
    ['gameplay_walkthroughs_tutorials', 'Gameplay Walkthroughs & Tutorials'],
    ['gta',                             'GTA'],
    ['horror_games',                    'Horror Games'],
    ['league_of_legends',               'League Of Legends'],
    ['minecraft',                       'Minecraft'],
    ['mobile_games',                    'Mobile Games'],
    ['nintendo_content',                'Nintendo Content'],
    ['pokemon',                         'Pokemon'],
    ['puzzle_casual_games',             'Puzzle & Casual Games'],
    ['roblox',                          'Roblox'],
    ['rocket_league',                   'Rocket League'],
    ['role_playing_games',              'Role-Playing Games (RPGs)'],
    ['shooter_games',                   'Shooter Games'],
    ['sports_racing_games',             'Sports & Racing Games'],
    ['strategy_simulation_games',       'Strategy & Simulation Games'],
    ['super_mario',                     'Super Mario'],
  ]),

  niche('health', 'Health', 'health and wellness', [
    ['alternative_holistic_medicine',     'Alternative & Holistic Medicine'],
    ['child_adolescent_health',           'Child & Adolescent Health'],
    ['disease_prevention_management',     'Disease Prevention & Management'],
    ['fitness_exercise',                  'Fitness & Exercise'],
    ['health_education_medical_science',  'Health Education & Medical Science'],
    ['mens_health',                       "Men's Health"],
    ['mental_health_well_being',          'Mental Health & Well-being'],
    ['nutrition_diet',                    'Nutrition & Diet'],
    ['physical_therapy_rehabilitation',   'Physical Therapy & Rehabilitation'],
    ['seniors_health',                    "Seniors' Health"],
    ['sexual_reproductive_health',        'Sexual & Reproductive Health'],
    ['sleep_health',                      'Sleep Health'],
    ['wellness_self_care',                'Wellness & Self-Care'],
    ['womens_health',                     "Women's Health"],
  ]),

  niche('home_diy', 'Home & DIY', 'home improvement and DIY', [
    ['diy_crafts_projects',                 'DIY Crafts & Projects'],
    ['embroidery',                          'Embroidery'],
    ['gardening_outdoor_living',            'Gardening & Outdoor Living'],
    ['home_improvement_renovation',         'Home Improvement & Renovation'],
    ['home_organization_decluttering',      'Home Organization & Decluttering'],
    ['homesteading_self_sufficiency',       'Homesteading & Self-Sufficiency'],
    ['interior_design_decor',               'Interior Design & Decor'],
    ['plumbing',                            'Plumbing'],
    ['sustainable_eco_friendly_living',     'Sustainable & Eco-Friendly Living'],
    ['woodworking_carpentry',               'Woodworking & Carpentry'],
  ]),

  niche('humanities', 'Humanities & Social Sciences', 'history and philosophy', [
    ['cultural_studies',                'Cultural Studies'],
    ['economics',                       'Economics'],
    ['gender_womens_studies',           "Gender & Women's Studies"],
    ['geography',                       'Geography'],
    ['history_archaeology',             'History & Archaeology'],
    ['linguistics',                     'Linguistics'],
    ['philosophy_ethics',               'Philosophy & Ethics'],
    ['political_science',               'Political Science'],
    ['psychology_behavioral_sciences',  'Psychology & Behavioral Sciences'],
    ['religion_theology',               'Religion & Theology'],
    ['sociology_anthropology',          'Sociology & Anthropology'],
  ]),

  niche('magic_paranormal', 'Magic & Paranormal', 'magic and paranormal', [
    ['magic_performances_illusions',            'Magic Performances & Illusions'],
    ['magic_tutorials_education',               'Magic Tutorials & Education'],
    ['mysteries_unexplained_phenomena',         'Mysteries & Unexplained Phenomena'],
    ['paranormal_investigations_ghost_hunting', 'Paranormal Investigations & Ghost Hunting'],
    ['paranormal_believers_vs_skeptics',        'Paranormal: Believers vs. Skeptics'],
    ['supernatural_stories_experiences',        'Supernatural Stories & Experiences'],
  ]),

  niche('motivation_self_improvement', 'Motivational & Self-Improvement', 'motivation and self improvement', [
    ['goal_setting_productivity', 'Goal Setting & Productivity'],
    ['life_coaching',             'Life Coaching'],
    ['mindfulness_meditation',    'Mindfulness & Meditation'],
    ['motivational_talks',        'Motivational Talks'],
    ['self_care_wellness',        'Self-Care & Wellness'],
  ]),

  niche('music', 'Music', 'music', [
    ['classical_music',                   'Classical Music'],
    ['country_music',                     'Country Music'],
    ['dj_sets_mixes',                     'DJ Sets & Mixes'],
    ['electronic_music',                  'Electronic Music'],
    ['hip_hop_rap',                       'Hip-Hop & Rap'],
    ['indian_music',                      'Indian Music'],
    ['instrumental_ambient_music',        'Instrumental & Ambient Music'],
    ['jazz_blues',                        'Jazz & Blues'],
    ['k_pop',                             'K-Pop'],
    ['latin_music',                       'Latin Music'],
    ['music_industry_insights_reviews',   'Music Industry Insights & Reviews'],
    ['music_performances_covers',         'Music Performances & Covers'],
    ['music_production_tutorials',        'Music Production & Tutorials'],
    ['pop_music',                         'Pop Music'],
    ['rock_music',                        'Rock Music'],
    ['world_cultural_music',              'World & Cultural Music'],
  ]),

  niche('nature_outdoors', 'Nature & Outdoor Activities', 'outdoor and nature', [
    ['adventure_extreme_sports',                'Adventure & Extreme Sports'],
    ['environmental_conservation_naturalists',  'Environmental Conservation & Naturalists'],
    ['fishing_angling',                         'Fishing & Angling'],
    ['gardening_botany',                        'Gardening & Botany'],
    ['hiking_trekking_camping',                 'Hiking, Trekking & Camping'],
    ['nature_photography_filmmaking',           'Nature Photography & Filmmaking'],
    ['outdoor_survival_bushcraft',              'Outdoor Survival & Bushcraft'],
    ['water_sports_activities',                 'Water Sports & Activities'],
    ['wildlife_observation_bird_watching',      'Wildlife Observation & Bird Watching'],
  ]),

  niche('news_politics', 'News & Politics', 'news and politics', [
    ['african_politics',                      'African Politics'],
    ['asian_politics',                        'Asian Politics'],
    ['australian_oceanian_politics',          'Australian & Oceanian Politics'],
    ['cultural_commentary',                   'Cultural Commentary'],
    ['economics_commentary',                  'Economics Commentary'],
    ['education_commentary',                  'Education Commentary'],
    ['environment_and_climate_commentary',    'Environment And Climate Commentary'],
    ['eu_politics',                           'EU Politics'],
    ['general_commentary',                    'General Commentary'],
    ['healthcare_commentary',                 'Healthcare Commentary'],
    ['immigration_commentary',                'Immigration Commentary'],
    ['latin_american_politics',               'Latin American Politics'],
    ['legal_justice_commentary',              'Legal & Justice Commentary'],
    ['religion_commentary',                   'Religion Commentary'],
    ['social_issues_commentary',              'Social Issues Commentary'],
    ['uk_politics',                           'UK Politics'],
    ['us_politics',                           'US Politics'],
  ]),

  niche('news_politics_us', 'News & Politics (US)', 'US news and politics', [
    ['cultural_commentary_us',                  'Cultural Commentary (U.S.)'],
    ['economics_commentary_us',                 'Economics Commentary (U.S.)'],
    ['education_commentary_us',                 'Education Commentary (U.S.)'],
    ['environment_and_climate_commentary_us',   'Environment And Climate Commentary (U.S.)'],
    ['general_commentary_us',                   'General Commentary (U.S.)'],
    ['healthcare_commentary_us',                'Healthcare Commentary (U.S.)'],
    ['immigration_commentary_us',               'Immigration Commentary (U.S.)'],
    ['legal_justice_commentary_us',             'Legal & Justice Commentary (U.S.)'],
    ['religion_commentary_us',                  'Religion Commentary (U.S.)'],
    ['social_issues_commentary_us',             'Social Issues Commentary (U.S.)'],
  ]),

  niche('podcast', 'Podcast', 'podcasts', [
    ['podcast_arts',             'Arts'],
    ['podcast_business',         'Business'],
    ['podcast_comedy',           'Comedy'],
    ['conversational_shows',     'Conversational Shows'],
    ['podcast_education',        'Education'],
    ['fiction',                  'Fiction'],
    ['podcast_gaming',           'Gaming'],
    ['government',               'Government'],
    ['podcast_health_fitness',   'Health & Fitness'],
    ['podcast_history',          'History'],
    ['interviews',               'Interviews'],
    ['podcast_kids',             'Kids'],
    ['podcast_music',            'Music'],
    ['podcast_news',             'News'],
    ['podcast_politics',         'Politics'],
    ['podcast_religion',         'Religion'],
    ['podcast_science',          'Science'],
    ['podcast_sports',           'Sports'],
    ['podcast_tv_film',          'TV & Film'],
  ]),

  niche('product_reviews', 'Product Reviews & Demos', 'product reviews', [
    ['product_reviews_automotive',            'Automotive'],
    ['baby_parenting_products',               'Baby & Parenting Products'],
    ['beauty_personal_care',                  'Beauty & Personal Care'],
    ['fashion_accessories',                   'Fashion & Accessories'],
    ['fitness_sports_equipment',              'Fitness & Sports Equipment'],
    ['food_drink',                            'Food & Drink'],
    ['gaming_accessories',                    'Gaming Accessories'],
    ['product_reviews_health_fitness',        'Health & Fitness'],
    ['home_appliances_kitchenware',           'Home Appliances & Kitchenware'],
    ['musical_instruments_audio_equipment',   'Musical Instruments & Audio Equipment'],
    ['office_school_supplies',                'Office & School Supplies'],
    ['pet_supplies',                          'Pet Supplies'],
    ['product_reviews_software_apps',         'Software & Apps'],
    ['tech_electronics',                      'Tech & Electronics'],
    ['travel_outdoor_gear',                   'Travel & Outdoor Gear'],
  ]),

  niche('relationships_family', 'Relationships & Family', 'relationships and family', [
    ['dating_single_life',                'Dating & Single Life'],
    ['divorce_separation',                'Divorce & Separation'],
    ['family_vlogs_lifestyle',            'Family Vlogs & Lifestyle'],
    ['fertility_pregnancy_adoption',      'Fertility, Pregnancy & Adoption'],
    ['lgbtq_relationships',               'LGBTQ+ Relationships'],
    ['marriage_partnerships',             'Marriage & Partnerships'],
    ['motherhood_fatherhood',             'Motherhood & Fatherhood'],
    ['parenting_family_advice',           'Parenting & Family Advice'],
    ['relationship_advice_counseling',    'Relationship Advice & Counseling'],
    ['senior_living_retirement',          'Senior Living & Retirement'],
  ]),

  niche('sales_marketing', 'Sales & Marketing', 'marketing and sales', [
    ['affiliate_marketing',                'Affiliate Marketing'],
    ['b2b_marketing',                      'B2B Marketing'],
    ['b2c_marketing',                      'B2C Marketing'],
    ['branding',                           'Branding'],
    ['content_marketing',                  'Content Marketing'],
    ['customer_relationship_management',   'Customer Relationship Management'],
    ['digital_marketing',                  'Digital Marketing'],
    ['ecommerce_marketing',                'E-commerce Marketing'],
    ['email_marketing',                    'Email Marketing'],
    ['growth_lead_generation',             'Growth & Lead Generation'],
    ['market_research',                    'Market Research'],
    ['marketing_analytics',                'Marketing Analytics'],
    ['marketing_automation',               'Marketing Automation'],
    ['public_relations',                   'Public Relations (PR)'],
    ['saas',                               'SaaS'],
    ['sales_techniques',                   'Sales Techniques'],
    ['social_media_marketing',             'Social Media Marketing'],
    ['video_marketing',                    'Video Marketing'],
  ]),

  niche('social_media', 'Social Media', 'social media growth', [
    ['content_creation',          'Content Creation'],
    ['influencer_marketing',      'Influencer Marketing'],
    ['instagram_growth',          'Instagram Growth'],
    ['linkedin_growth',           'LinkedIn Growth'],
    ['personal_branding',         'Personal Branding'],
    ['podcasts',                  'Podcasts'],
    ['social_commerce',           'Social Commerce'],
    ['social_media_commentary',   'Social Media Commentary'],
    ['social_media_education',    'Social Media Education'],
    ['social_media_ethics',       'Social Media Ethics'],
    ['social_media_tools',        'Social Media Tools'],
    ['social_media_trends',       'Social Media Trends'],
    ['tiktok_growth',             'TikTok Growth'],
    ['youtube_growth',            'YouTube Growth'],
  ]),

  niche('sports', 'Sports', 'sports', [
    ['american_football',           'American Football (NFL)'],
    ['athletics_track_sports',      'Athletics & Track Sports'],
    ['baseball',                    'Baseball'],
    ['basketball',                  'Basketball'],
    ['combat_sports',               'Combat Sports'],
    ['cricket',                     'Cricket'],
    ['cycling',                     'Cycling'],
    ['extreme_adventure_sports',    'Extreme & Adventure Sports'],
    ['golf',                        'Golf'],
    ['motorsports',                 'Motorsports'],
    ['racket_sports',               'Racket Sports'],
    ['rugby',                       'Rugby'],
    ['snowboarding_skiing',         'Snowboarding & Skiing'],
    ['soccer',                      'Soccer (Football)'],
    ['sports_documentaries',        'Sports Documentaries'],
    ['sports_highlights_analysis',  'Sports Highlights & Analysis'],
    ['sports_news_commentary',      'Sports News & Commentary'],
    ['sports_players_own_channel',  "Sports Players' Own Channel"],
    ['sports_training_coaching',    'Sports Training & Coaching'],
    ['team_sports',                 'Team Sports'],
    ['tennis',                      'Tennis'],
    ['water_sports',                'Water Sports'],
    ['winter_sports',               'Winter Sports'],
  ]),

  niche('tech_ai_software', 'Tech, AI & Software', 'tech and AI', [
    ['ai',                                  'AI'],
    ['automation',                          'Automation'],
    ['cloud_computing_big_data',            'Cloud Computing & Big Data'],
    ['coding_software_development_no_code', 'Coding, Software Development & No-Code'],
    ['cybersecurity_data_protection',       'Cybersecurity & Data Protection'],
    ['gadgets_consumer_electronics',        'Gadgets, Consumer Electronics'],
    ['green_tech_sustainable_innovation',   'Green Tech & Sustainable Innovation'],
    ['machine_learning',                    'Machine Learning'],
    ['news_trends',                         'News & Trends'],
    ['product_walkthroughs_tutorials',      'Product Walkthroughs & Tutorials'],
    ['robotics',                            'Robotics'],
    ['smart_home_internet_of_things',       'Smart Home & Internet of Things (IoT)'],
    ['software_apps',                       'Software & Apps'],
    ['tech_entrepreneurship_startups',      'Tech Entrepreneurship & Startups'],
    ['tech_reviews',                        'Tech Reviews'],
    ['virtual_augmented_reality',           'Virtual & Augmented Reality (VR & AR)'],
  ]),

  niche('travel', 'Travel', 'travel vlogs', [
    ['adventure_travel',          'Adventure Travel'],
    ['airports_airlines',         'Airports & Airlines'],
    ['budget_travel_hacks',       'Budget Travel & Hacks'],
    ['cruises_ships',             'Cruises & Ships'],
    ['cultural_travel',           'Cultural Travel'],
    ['eco_sustainable_travel',    'Eco & Sustainable Travel'],
    ['luxury_travel',             'Luxury Travel'],
    ['road_trips',                'Road Trips'],
    ['train_travel',              'Train Travel'],
    ['travel_bloggers',           'Travel Bloggers'],
    ['travel_destinations',       'Travel Destinations'],
    ['travel_planning',           'Travel Planning'],
  ]),

  niche('video_essays', 'Video Essays', 'video essays', [
    ['conspiracies_cults',                          'Conspiracies & Cults'],
    ['cultural_regional_explorations',              'Cultural & Regional Explorations'],
    ['economic_business_insights',                  'Economic & Business Insights'],
    ['film_media_critique',                         'Film & Media Critique'],
    ['historical_analysis',                         'Historical Analysis'],
    ['internet_phenomena_meme_culture',             'Internet Phenomena & Meme Culture'],
    ['literary_analysis',                           'Literary Analysis'],
    ['personal_narratives_autobiographical_essays', 'Personal Narratives & Autobiographical Essays'],
    ['science_technology_explainers',               'Science & Technology Explainers'],
    ['social_media_influencer_deep_dives',          'Social Media & Influencer Deep Dives'],
    ['true_crime',                                  'True Crime'],
  ]),
];

// -----------------------------------------------------------------------------
// Invariant check + lookup tables — built once on module load. Throws on any
// of: duplicate niche slug, duplicate sub-niche slug, sub-niche slug colliding
// with a top-level niche slug, mismatched parentSlug, or NICHES out of sync
// with VALID_NICHE_SLUGS.
// -----------------------------------------------------------------------------

function assertTaxonomyInvariants(): {
  nicheBySlug: ReadonlyMap<string, NicheDefinition>;
  subNicheByGlobalSlug: ReadonlyMap<string, SubNiche>;
} {
  const nicheBySlug = new Map<string, NicheDefinition>();
  const subNicheByGlobalSlug = new Map<string, SubNiche>();

  for (const n of NICHES) {
    if (nicheBySlug.has(n.slug)) {
      throw new Error(`[lib/niches] duplicate niche slug: "${n.slug}"`);
    }
    nicheBySlug.set(n.slug, n);
  }

  // NICHES must define exactly the slugs declared in VALID_NICHE_SLUGS, in the
  // same set (order may differ for readability — but every slug must round-trip).
  for (const slug of VALID_NICHE_SLUGS) {
    if (!nicheBySlug.has(slug)) {
      throw new Error(
        `[lib/niches] VALID_NICHE_SLUGS lists "${slug}" but NICHES has no entry.`,
      );
    }
  }
  for (const n of NICHES) {
    if (!(VALID_NICHE_SLUGS as readonly string[]).includes(n.slug)) {
      throw new Error(
        `[lib/niches] NICHES contains "${n.slug}" but VALID_NICHE_SLUGS does not.`,
      );
    }
  }

  for (const n of NICHES) {
    const seenInParent = new Set<string>();
    for (const s of n.subNiches) {
      if (s.parentSlug !== n.slug) {
        throw new Error(
          `[lib/niches] sub-niche "${s.slug}" has parentSlug "${s.parentSlug}" ` +
          `but is nested under niche "${n.slug}"`,
        );
      }
      if (seenInParent.has(s.slug)) {
        throw new Error(
          `[lib/niches] duplicate sub-niche slug "${s.slug}" within parent "${n.slug}"`,
        );
      }
      seenInParent.add(s.slug);
      if (subNicheByGlobalSlug.has(s.slug)) {
        throw new Error(`[lib/niches] duplicate sub-niche slug across parents: "${s.slug}"`);
      }
      if (nicheBySlug.has(s.slug)) {
        throw new Error(
          `[lib/niches] sub-niche slug "${s.slug}" collides with a top-level ` +
          `niche slug. Prefix it with the parent slug (e.g. "${n.slug}_${s.slug}").`,
        );
      }
      subNicheByGlobalSlug.set(s.slug, s);
    }
  }

  return { nicheBySlug, subNicheByGlobalSlug };
}

const { nicheBySlug: NICHE_BY_SLUG, subNicheByGlobalSlug: SUB_NICHE_BY_GLOBAL_SLUG } =
  assertTaxonomyInvariants();

// -----------------------------------------------------------------------------
// Public lookup helpers
// -----------------------------------------------------------------------------

/**
 * Runtime type guard. Narrows an unknown value to ValidNicheSlug. Use at any
 * boundary where slug input arrives from outside the type system (URL params,
 * database rows, request bodies, third-party APIs).
 */
export function isValidNicheSlug(value: unknown): value is ValidNicheSlug {
  return typeof value === 'string' && NICHE_BY_SLUG.has(value);
}

/** Returns the NicheDefinition with this slug, or undefined if no match. */
export function getNicheBySlug(slug: string): NicheDefinition | undefined {
  return NICHE_BY_SLUG.get(slug);
}

/**
 * Returns the SubNiche identified by (parentSlug, subSlug), or undefined if
 * either the parent doesn't exist or the parent has no sub-niche by that slug.
 * Disambiguates the rare case where the same sub-niche slug could appear under
 * different parents.
 */
export function getSubNicheBySlug(parentSlug: string, subSlug: string): SubNiche | undefined {
  const parent = NICHE_BY_SLUG.get(parentSlug);
  if (!parent) return undefined;
  return parent.subNiches.find((s) => s.slug === subSlug);
}

/**
 * Returns the displayName for either a top-level niche slug or a sub-niche
 * slug. Falls back to the slug itself if nothing matches — never throws, so
 * UI code can safely render the result.
 */
export function getDisplayName(slug: string): string {
  const niche = NICHE_BY_SLUG.get(slug);
  if (niche) return niche.displayName;
  const sub = SUB_NICHE_BY_GLOBAL_SLUG.get(slug);
  if (sub) return sub.displayName;
  return slug;
}

/** True if the given slug identifies a known top-level niche. */
export function isNicheSlug(slug: string): boolean {
  return NICHE_BY_SLUG.has(slug);
}

/** True if the given slug identifies a known sub-niche (any parent). */
export function isSubNicheSlug(slug: string): boolean {
  return SUB_NICHE_BY_GLOBAL_SLUG.has(slug);
}

/** All top-level niche slugs, in taxonomy order. */
export function getAllNicheSlugs(): readonly ValidNicheSlug[] {
  return VALID_NICHE_SLUGS;
}

/** All sub-niche slugs across every parent niche, in taxonomy order. */
export function getAllSubNicheSlugs(): string[] {
  return NICHES.flatMap((n) => n.subNiches.map((s) => s.slug));
}
