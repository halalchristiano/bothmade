-- Work delivered outside the system had no way to be recorded as delivered.
--
-- The send button mails the folder on a tracked link, which is right almost
-- always and wrong in the case it cannot cover: a client who needed something
-- the standard email would have described inaccurately, sent by hand instead.
-- The lead then sat on the "to build" queue as outstanding work forever,
-- because the only thing that could take it off was the button that had
-- deliberately not been used.
--
-- Additive only: two nullable columns, nothing moved.
ALTER TABLE "leads" ADD COLUMN "mockupSentManuallyAt" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN "mockupSentManuallyNote" TEXT;
