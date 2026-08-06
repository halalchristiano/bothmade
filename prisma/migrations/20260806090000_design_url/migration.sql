-- There was nowhere to put the design.
--
-- "Send the design for review" started the Section 4 clock and emailed the
-- client a deadline, but nothing held the design itself — so the client's
-- dashboard had no button to open the thing it was asking them to approve,
-- and the link went over separately by hand or not at all.
--
-- Additive only: one nullable column, nothing moved.
ALTER TABLE "projects" ADD COLUMN "designUrl" TEXT;
