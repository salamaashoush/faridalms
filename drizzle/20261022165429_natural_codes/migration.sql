-- Codes read with their numbers as numbers, so "RL.3.2" comes before
-- "RL.3.10" as a framework lists them. Postgres ships no collation that
-- orders digits by value, so this one is made from ICU's numeric option.

create collation if not exists core.natural (provider = icu, locale = 'und-u-kn-true');
