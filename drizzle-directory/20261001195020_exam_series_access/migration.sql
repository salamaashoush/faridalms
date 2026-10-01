-- Cells read the official sessions to default a school's dates; only the
-- operator tool changes them.
grant select on exam_series to directory_reader;
grant select, insert, update on exam_series to directory_admin;
-- Dates from the boards' 2025-2026 regulations, with the appeal window after
-- results enquiries close (docs/research/school-packs.md, section 1).
insert into exam_series (id, board, sits_in, keep_until) values
  ('cambridge-2026-06', 'cambridge', '2026-06-01', '2026-11-01'),
  ('cambridge-2026-11', 'cambridge', '2026-11-01', '2027-04-09'),
  ('ib-2026-11', 'ib', '2026-11-01', '2027-03-15'),
  ('ib-2027-05', 'ib', '2027-05-01', '2027-09-15');
