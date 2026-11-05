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
