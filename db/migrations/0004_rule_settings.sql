-- The planner's editable rule numbers. One row. No row means the documented defaults apply.
create table rule_settings (
  id smallint primary key default 1 check (id = 1),
  settings jsonb not null,
  reason text not null,
  updated_by text not null,
  updated_at timestamptz not null default now()
);
