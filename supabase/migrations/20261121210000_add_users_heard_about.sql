-- "How did you hear about SetLab?" + first-touch attribution on public.users.
-- All columns are nullable; existing rows are untouched.
--
-- Writes go through the service role (/api/account/heard-about and the auth
-- callback/welcome routes), because users_column_privileges only lets the
-- authenticated role update id/email. No new grants are needed: the existing
-- table-level SELECT plus the users_own_row RLS policy lets a user read their
-- own heard_about_at, which the client uses to decide whether to ask.

alter table public.users
  add column if not exists heard_about text,
  add column if not exists heard_about_other text,
  add column if not exists heard_about_at timestamptz,
  add column if not exists first_touch jsonb;

alter table public.users
  drop constraint if exists users_heard_about_check,
  add constraint users_heard_about_check check (
    heard_about is null or heard_about in (
      'ai_assistant', 'google', 'friend_dj', 'reddit',
      'discord_forum', 'social_video', 'other', 'skipped'
    )
  ),
  drop constraint if exists users_heard_about_other_len,
  add constraint users_heard_about_other_len check (
    heard_about_other is null or char_length(heard_about_other) <= 200
  );

comment on column public.users.heard_about is
  'Answer to "How did you hear about SetLab?" at signup; ''skipped'' if dismissed.';
comment on column public.users.heard_about_other is 'Free text when heard_about = ''other''.';
comment on column public.users.heard_about_at is 'When the prompt was answered or skipped.';
comment on column public.users.first_touch is
  'First page view before signup: utm_source/medium/campaign, external referrer host, landing_path, captured_at.';
