CREATE TABLE member_public_profiles (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
);
