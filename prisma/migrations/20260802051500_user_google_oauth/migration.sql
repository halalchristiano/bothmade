-- OAuth 2.0 refresh token for Gmail sending (Workspace accounts generally can't use App Passwords)
ALTER TABLE "users" ADD COLUMN "googleRefreshToken" TEXT;
