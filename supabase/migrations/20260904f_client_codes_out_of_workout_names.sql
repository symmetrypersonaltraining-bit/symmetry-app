-- THE RENAME. 160 day labels and 6 programme names carried a person.
--
-- Dustin, 4 Sep: "we need to rename these. public workouts should never get
-- named by client names or initials."
--
-- What was in there: 28 client-code prefixes — GG2 (Gerard Gautreaux), SG2
-- (Sharon Gautreaux), HK5/HK6 (Hassan Kareem), JD6 (Jennifer Day), KR2, LK6,
-- LS6, LSP6, MC6, MM2, RB6, RM6, SD6, SP/SP6, SR6, SW6, TS6, TY6, CH2, CL/CL2,
-- CO2, GL2, GW2, AF — plus four programmes ending "— Sara", "— Jennifer",
-- "— Claudine", "— Tyler".
--
-- Worse than the initials were the parentheses, which carried the reason:
-- "(back is talking today)", "(left leg or foot bothering him)", "(Dizzy Day
-- (lightheaded, everything seated))". A client searching the library would have
-- read his parents' and his clients' conditions off the workout list.
--
-- Conditions themselves are kept — they are useful and impersonal. What is
-- removed is the person: the code, the name, the pronoun, the second person.
--
-- Backed up to bak_day_labels_initials_20260904 and bak_program_names_20260904.
update days d set label = trim(
  regexp_replace(
    regexp_replace(
      regexp_replace(d.label, '^[A-Z]{2,4}[0-9]\s+', ''),
      '^(CL|SP|SD|AF)\s+(—|–|-)\s*', ''),
    '^(CL|SP|AF)\s+(?=[A-Z])', '')
)
where d.label ~ '^[A-Z]{2,4}[0-9] ' or d.label ~ '^(CL|SP|SD|AF) ';

update days set label = replace(label, ' (left leg or foot bothering him)', ' (Left Leg or Foot Sensitive)') where label like '%bothering him)%';
update days set label = replace(label, ' (back is talking today)', ' (Low Back Sensitive)') where label like '%back is talking today%';
update days set label = replace(label, ' (back or hip is talking today)', ' (Low Back or Hip Sensitive)') where label like '%back or hip is talking today%';
update days set label = replace(label, ' (your own kit)', ' (Travel Kit)') where label like '%your own kit%';
update days set label = replace(label, ' — Client''s Choice 20-30 min', ' — Choice, 20-30 min') where label like '%Client''s Choice%';
update days set label = replace(label, ' (with Celeste)', ' (Partner-Assisted)') where label like '%(with Celeste)%';
update days set label = replace(label, ' (Sevens — Dustin or Celeste-led)', ' (Sevens — Supervised or Partner-Assisted)') where label like '%Dustin or Celeste-led%';
update days set label = replace(label, ' (w/ Dustin)', ' (Supervised)') where label like '%(w/ Dustin)%';

update programs set name = regexp_replace(name, '\s*(—|–|-)\s*(Sara|Jennifer|Claudine|Tyler)\s*$', '')
where name ~ '(—|–|-)\s*(Sara|Jennifer|Claudine|Tyler)\s*$';
