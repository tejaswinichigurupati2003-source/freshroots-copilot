-- Raghav can approve more lines after a first push, so one run may need several drafts for the same distributor.
-- Duplicate SKUs are blocked in code (a SKU already in a draft for the run is skipped), not by this constraint.
alter table zoho_drafts drop constraint zoho_drafts_run_id_distributor_id_key;
