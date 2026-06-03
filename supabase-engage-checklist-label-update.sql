-- Engage checklist label update
-- Run this once in Supabase SQL Editor if you want existing checked items
-- to keep their completion status under the new Engage labels.

update stage_checklist_items
set
  label = case label
    when 'Share personal testimony' then 'Prepare 2min Testimony'
    when 'Invite to Grace Group or church' then 'Use SALT (Start a conversation, Ask Questions, Listen, Testimony)'
    when 'Make first meaningful connection' then 'Meaningful Connection - Implement SALT. Hear their story. Share yours.'
    when 'Schedule a follow-up conversation' then 'Schedule Follow Up'
    when 'Begin praying consistently for this person' then 'Consistently Pray'
    else label
  end,
  updated_at = now()
where stage = 'Engage'
  and label in (
    'Share personal testimony',
    'Invite to Grace Group or church',
    'Make first meaningful connection',
    'Schedule a follow-up conversation',
    'Begin praying consistently for this person'
  );

-- The old 'Ask about prayer needs' item has no direct replacement in the new list.
-- Leaving it in the database is safe because the app only displays current template labels.
