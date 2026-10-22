-- Additive only: adds nullable columns so the app can record which model wrote the explanations and what it cost.
-- Nothing is dropped, renamed or changed, and every insert and update the app already does keeps working.
-- Safe to run more than once.
alter table runs add column if not exists llm_model text;
alter table runs add column if not exists llm_calls integer;
alter table runs add column if not exists llm_prompt_tokens integer;
alter table runs add column if not exists llm_completion_tokens integer;
alter table runs add column if not exists llm_cost_usd numeric;

alter table recommendations add column if not exists explanation_model text;
