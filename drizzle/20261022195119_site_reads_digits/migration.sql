-- A school's website writes its numbers in the digits the school chose,
-- so the role that draws it reads that choice.
grant select (digits) on core.orgs to site;
