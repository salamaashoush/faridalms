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
