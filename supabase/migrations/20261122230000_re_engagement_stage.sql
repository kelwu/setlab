-- Record which stage-specific re-engagement email each log row was for, so the
-- cron can cap sends per user and we can see what went to whom.
alter table public.re_engagement_log
  add column if not exists stage text;

create index if not exists re_engagement_log_user_sent_idx
  on public.re_engagement_log (user_id, sent_at);

-- Who has opted out of marketing email, so we never send to them again even if
-- the Loops contact is later recreated or reset. Service-role only: RLS on, no policies.
create table if not exists public.email_suppressions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  reason text not null default 'unsubscribed',
  noted_at timestamptz not null default now()
);
alter table public.email_suppressions enable row level security;
