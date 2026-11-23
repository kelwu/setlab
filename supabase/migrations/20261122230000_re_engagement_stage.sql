-- Record which stage-specific re-engagement email each log row was for, so the
-- cron can cap sends per user and we can see what went to whom.
alter table public.re_engagement_log
  add column if not exists stage text;

create index if not exists re_engagement_log_user_sent_idx
  on public.re_engagement_log (user_id, sent_at);
