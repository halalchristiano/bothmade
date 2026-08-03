-- When a user last opened the team chat. Drives the unread badge so that
-- broadcast messages (toUserId = null) can be marked read per-user, which a
-- single shared TeamMessage.readAt could not represent.
ALTER TABLE "users" ADD COLUMN     "teamChatReadAt" TIMESTAMP(3);
