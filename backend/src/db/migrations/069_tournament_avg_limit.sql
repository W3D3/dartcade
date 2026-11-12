-- The average limit (#604) is a setting every tournament has, null when there is none: give the
-- tournaments saved before it one, so their settings stay whole.
UPDATE tournaments SET settings = settings || '{"avgLimit": null}' WHERE NOT settings ? 'avgLimit';
