-- Calls placed through the phone network, and what the network said happened.
--
-- Every other record of a call in this app is somebody's account of one. The
-- dial log got closer — it records that a number was tapped, with nothing to
-- press and no way to skip it — but the browser hands off to the operating
-- system and never hears another word, so a number that rang out and a
-- twenty-minute conversation are identical to it.
--
-- These rows are the carrier's account. Nobody types them and nobody can edit
-- them: `answeredAt` and `durationSeconds` are facts rather than claims.
--
-- Its own table rather than another leadActivity type because a call has a
-- life — queued, ringing, answered, over — and each of those arrives as a
-- separate webhook minutes apart. An activity row is written once and never
-- moves.
CREATE TABLE "phone_calls" (
  "id"              TEXT NOT NULL,
  "leadId"          TEXT NOT NULL,
  "placedById"      TEXT,
  "providerSid"     TEXT NOT NULL,
  "toNumber"        TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'queued',
  "durationSeconds" INTEGER,
  "answeredAt"      TIMESTAMP(3),
  "endedAt"         TIMESTAMP(3),
  "failureReason"   TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "phone_calls_pkey" PRIMARY KEY ("id")
);

-- Unique because every webhook about a call arrives keyed on this and may
-- arrive more than once: providers retry. A retry must update the row it
-- already wrote, never add a second one.
CREATE UNIQUE INDEX "phone_calls_providerSid_key" ON "phone_calls" ("providerSid");

CREATE INDEX "phone_calls_leadId_createdAt_idx" ON "phone_calls" ("leadId", "createdAt");
CREATE INDEX "phone_calls_placedById_createdAt_idx" ON "phone_calls" ("placedById", "createdAt");

ALTER TABLE "phone_calls"
  ADD CONSTRAINT "phone_calls_leadId_fkey" FOREIGN KEY ("leadId")
  REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL rather than CASCADE: if somebody's account is deleted the calls
-- they made still happened, and the lead's history should not lose them.
ALTER TABLE "phone_calls"
  ADD CONSTRAINT "phone_calls_placedById_fkey" FOREIGN KEY ("placedById")
  REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Where the network rings this person when they place a call from the app.
-- Their own handset — there is no softphone here and nothing to install. Null
-- means calls fall back to a plain tel: link, which is what every account did
-- before this existed.
ALTER TABLE "users" ADD COLUMN "callbackNumber" TEXT;
