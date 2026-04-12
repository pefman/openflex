-- Rename legacy default optimization profile label to a clearer name.
UPDATE "OptimizationProfile"
SET "name" = '5.1 Downmix'
WHERE "name" = 'Audio Fix'
  AND NOT EXISTS (
    SELECT 1
    FROM "OptimizationProfile" AS op
    WHERE op."name" = '5.1 Downmix'
  );
