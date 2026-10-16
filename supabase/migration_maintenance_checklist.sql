-- Service checklist on maintenance entries: [{ "item": "Replace spark plug", "done": true, "note": "" }, ...]
alter table maintenance add column if not exists checklist jsonb;
