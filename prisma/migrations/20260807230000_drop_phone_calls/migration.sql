-- Removing the carrier integration, which was declined.
--
-- Calls routed through Twilio would have reported back whether a lead
-- actually answered and for how long — the one thing a browser cannot know.
-- The cost was that every prospect would see a Twilio number as caller ID
-- rather than the person ringing them, and that was not a trade worth making
-- for this studio.
--
-- Dropped rather than left dormant. An unused table is a small thing; an
-- unused PUBLIC webhook that answers with an instruction to dial a number is
-- not, and neither is a settings field nobody can explain. Code nobody wants
-- is a liability whether or not it runs.
--
-- SAFE: nothing was ever written here. The table could only be filled by a
-- deployment with Twilio credentials set, and none were. `callbackNumber` was
-- likewise only ever offered on a screen that never appeared without them.
DROP TABLE IF EXISTS "phone_calls";

ALTER TABLE "users" DROP COLUMN IF EXISTS "callbackNumber";
