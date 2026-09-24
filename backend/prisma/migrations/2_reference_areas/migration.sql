-- Seed the public reference data required for ride requests.
-- User accounts remain intentionally unseeded; users can sign up securely.
INSERT INTO "areas" ("name", "lat", "lng") VALUES
    ('Banani', 23.7937, 90.4066),
    ('Gulshan 1', 23.7925, 90.4078),
    ('Gulshan 2', 23.7936, 90.4155),
    ('Mohakhali', 23.7806, 90.4074),
    ('Dhanmondi', 23.7461, 90.3742),
    ('Mirpur', 23.8069, 90.3687),
    ('Uttara', 23.8759, 90.3795),
    ('Farmgate', 23.7574, 90.3885),
    ('Bashundhara', 23.8223, 90.4265)
ON CONFLICT ("name") DO UPDATE
SET "lat" = EXCLUDED."lat",
    "lng" = EXCLUDED."lng";
