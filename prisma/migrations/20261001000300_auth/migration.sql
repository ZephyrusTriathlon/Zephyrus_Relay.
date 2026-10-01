ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT, ADD COLUMN "depotId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_passwordHash_check" CHECK ("passwordHash" IS NULL OR "passwordHash" ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$');
CREATE TABLE "Session" (sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL);
CREATE INDEX "Session_expire_idx" ON "Session" (expire);
