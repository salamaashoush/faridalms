-- The console is the business database's only client.
grant usage on schema public to business_admin;
grant select, insert, update on operators to business_admin;
-- The event log is appended to and read, never changed.
grant select, insert on business_events to business_admin;

-- A plan or add-on version, and its prices, are written once and only ever
-- retired, so what a contract bought cannot change under it.
grant select, insert on plans, add_ons, prices to business_admin;
grant select, insert on plan_versions, add_on_versions to business_admin;
grant update (retired_at) on plan_versions, add_on_versions to business_admin;

-- Customers, their contacts and subscriptions change as the business does;
-- an item or override is ended by its date, never deleted.
grant select, insert, update on customers, contacts, subscriptions to business_admin;
grant select, insert on subscription_items, subscription_overrides to business_admin;
grant update (ends_on) on subscription_items, subscription_overrides to business_admin;
grant select, insert on entitlement_publications to business_admin;

-- A draft changes as it is filled in and created, and is abandoned rather
-- than deleted, so its history stays in business_events.
grant select, insert, update on provisioning_drafts to business_admin;

-- The business's profile changes as it does; a tax rate is followed by a
-- new one, never changed.
grant select, insert, update on business_profile to business_admin;
grant select, insert on tax_rates to business_admin;

-- Leads change as they are worked, and a lost one is deleted two years
-- after it was last contacted, with its activities and any quote it was
-- given that no customer accepted.
grant select, insert, update, delete on leads to business_admin;
grant select, insert, delete on lead_activities to business_admin;
grant select, insert, update, delete on quotes to business_admin;

-- Numbers are given by locking their series' row; a gap would be a missing
-- tax document, so none is ever deleted.
grant select, insert, update on document_numbers to business_admin;
-- An invoice changes until it is issued and then only its state, tax id and
-- payment link; its lines are rewritten only while it is a draft.
grant select, insert, update on invoices to business_admin;
grant select, insert, delete on invoice_lines to business_admin;
-- Credit notes, payments and what they settle are written once.
grant select, insert, update (tax_authority_id) on credit_notes to business_admin;
grant select, insert on payments, payment_allocations to business_admin;

-- A pause can be ended early; nothing else about it changes.
grant select, insert, update (ends_on) on dunning_pauses to business_admin;
-- A step is taken once and never undone.
grant select, insert on dunning_steps to business_admin;
-- The clock's own change to a tenant, gone once it is undone.
grant select, insert, update, delete on dunning_standings to business_admin;
-- A task is reassigned or closed with what came of it.
grant select, insert, update (assignee_id, done_at, done_by, outcome) on tasks to business_admin;
