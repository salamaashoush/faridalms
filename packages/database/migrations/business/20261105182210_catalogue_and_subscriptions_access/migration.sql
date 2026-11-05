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
