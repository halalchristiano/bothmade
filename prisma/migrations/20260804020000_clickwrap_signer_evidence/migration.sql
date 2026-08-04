-- The signature record used to be a timestamp, an IP, and a hash: enough to
-- say a request arrived, not enough to say who made it or what sentence they
-- accepted. These three carry the rest of the evidence.
--
-- Nullable and unbackfilled on purpose. Signatures taken before this
-- migration genuinely have no typed name and no recorded statement, and
-- inventing one for them would be the one thing worse than not having it.
ALTER TABLE "leads" ADD COLUMN     "agreementSignerName" TEXT,
ADD COLUMN     "agreementUserAgent" TEXT,
ADD COLUMN     "agreementStatement" TEXT;
