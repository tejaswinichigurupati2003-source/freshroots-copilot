-- Freshroots Demand Planning Copilot: initial schema.
-- Applied by `npm run migrate`. Plain Postgres, so it also runs in the Neon SQL editor.

create table distributors (
  distributor_id text primary key,
  distributor_name text not null,
  region text not null,
  status text not null
);

create table skus (
  sku_id text primary key,
  sku_name text not null,
  category text not null,
  perishability text not null check (perishability in ('Low', 'Medium', 'High')),
  standard_reorder_qty integer not null check (standard_reorder_qty > 0),
  unit_of_measure text not null,
  distributor_id text not null references distributors (distributor_id)
);

create table calendar (
  year_month text primary key,
  year integer not null,
  month integer not null check (month between 1 and 12),
  is_festival_month boolean not null
);

create table sales_weekly (
  sku_id text not null references skus (sku_id),
  week text not null check (week ~ '^[0-9]{4}-W[0-9]{2}$'),
  units_sold integer not null check (units_sold >= 0),
  primary key (sku_id, week)
);

create table stock_snapshots (
  id bigint generated always as identity primary key,
  sku_id text not null references skus (sku_id),
  location text not null,
  units_on_hand integer not null check (units_on_hand >= 0),
  as_of_date date not null,
  unique (sku_id, location, as_of_date)
);

create table open_pos (
  po_id text primary key,
  sku_id text not null references skus (sku_id),
  qty_units integer not null check (qty_units > 0),
  order_date date not null,
  expected_arrival date not null,
  status text not null
);

create table sku_economics (
  sku_id text primary key references skus (sku_id),
  unit_cost_inr numeric not null,
  selling_price_inr numeric not null,
  stockout_loss_per_unit_inr numeric not null,
  overstock_loss_per_unit_inr numeric not null
);

create table past_recommendations (
  month text not null,
  sku_id text not null references skus (sku_id),
  raghav_flag text not null,
  order_qty_multiple text not null,
  raghav_action text not null,
  basis text not null,
  notes text,
  primary key (month, sku_id)
);

create table runs (
  id uuid primary key default gen_random_uuid(),
  as_of_date date not null,
  triggered_by text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'blocked', 'failed')),
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table recommendations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  sku_id text not null references skus (sku_id),
  flag text not null check (flag in ('STOCKOUT_RISK', 'OVERSTOCK_RISK', 'HIGH_DEMAND', 'OK', 'INSUFFICIENT_HISTORY')),
  recommended_qty integer not null check (recommended_qty >= 0),
  weeks_of_cover numeric,
  spike_ratio numeric,
  effective_stock integer not null,
  signals jsonb not null default '{}'::jsonb,
  reason text,
  edge_case_type text check (edge_case_type in ('NONE', 'NEW_LAUNCH', 'DISTRIBUTOR_DROP', 'ONE_OFF_SPIKE', 'OTHER')),
  evidence text,
  explanation_source text check (explanation_source in ('llm', 'template')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'pushed')),
  created_at timestamptz not null default now(),
  unique (run_id, sku_id)
);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null unique references recommendations (id) on delete cascade,
  sku_id text not null references skus (sku_id),
  decided_by text not null,
  action text not null check (action in ('approved', 'edited', 'rejected')),
  original_qty integer not null,
  final_qty integer not null check (final_qty >= 0),
  reason text,
  decided_at timestamptz not null default now(),
  check (action <> 'rejected' or char_length(coalesce(reason, '')) >= 5)
);

-- Used by the mock Zoho gateway: one draft purchase order per distributor per run.
create table zoho_drafts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  distributor_id text not null references distributors (distributor_id),
  lines jsonb not null,
  mode text not null check (mode in ('mock', 'live')),
  external_id text,
  response jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, distributor_id)
);

-- Quarterly loss in lakh. Baseline rows come from the seed; actuals are entered on the monitor page.
create table loss_tracking (
  id bigint generated always as identity primary key,
  period text not null unique,
  stockout_loss_lakh numeric not null check (stockout_loss_lakh >= 0),
  overstock_loss_lakh numeric not null check (overstock_loss_lakh >= 0),
  total_loss_lakh numeric generated always as (stockout_loss_lakh + overstock_loss_lakh) stored,
  source text not null,
  entered_by text,
  created_at timestamptz not null default now()
);

-- Holds the single kill switch row (key = 'kill_switch').
create table system_state (
  key text primary key,
  is_active boolean not null default false,
  reason text,
  tripped_at timestamptz,
  resumed_at timestamptz,
  resumed_by text
);

insert into system_state (key, is_active) values ('kill_switch', false);

create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  entity text,
  entity_id text,
  details jsonb not null default '{}'::jsonb
);

create index recommendations_run_idx on recommendations (run_id);
create index decisions_decided_at_idx on decisions (decided_at);
create index audit_log_at_idx on audit_log (at desc);
create index sales_weekly_sku_idx on sales_weekly (sku_id, week);
