-- Invites are now looked up by the SHA-256 (hex) of their token — the raw token lives only in the
-- emailed link. Hash every token stored in the clear so already-sent links keep working.
UPDATE "invites" SET "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex');
