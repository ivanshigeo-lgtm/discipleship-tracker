-- Feed inbox: let recipients archive (soft-hide) and delete the messages that
-- come through. `archived_at` hides a message from the inbox without losing it;
-- a "Show archived" toggle in the app surfaces them again. Deleting removes it.
--
-- Archiving/unarchiving is an UPDATE, already permitted by the existing
-- "Recipients can mark messages read" policy (USING to_person_id = me), so no
-- new UPDATE policy is needed. Deletes had NO policy, so RLS blocked them —
-- add a recipient-scoped DELETE policy so a person can remove messages sent to
-- them (never someone else's).

alter table public.messages add column if not exists archived_at timestamptz;

drop policy if exists "Recipients can delete messages" on public.messages;
create policy "Recipients can delete messages" on public.messages
  for delete
  using (
    to_person_id in (
      select id from public.people where auth_user_id = auth.uid()
    )
  );
