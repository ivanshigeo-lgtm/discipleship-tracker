-- Test-data flags: hide App Review demo entities from real users' views.
-- claude.tester (Kai Nakamura) must keep coach access for App Review; the app
-- filters is_test rows out for viewers whose own person row is not is_test.

alter table people add column if not exists is_test boolean not null default false;
alter table victory_groups add column if not exists is_test boolean not null default false;

update people set is_test = true where id in (
  '8598f4c5-d563-4287-9fd7-6bb51d17c4ca', -- Kai Nakamura (claude.tester)
  '4e902376-b0f1-48a5-b359-f26ab67577e4', -- Leilani Santos
  'ca83dbec-5743-4d4b-ae01-0425137e2766', -- Marcus Chen
  'ba4f4ecd-ad0e-4361-8f84-fb98cefd70b6'  -- Noa Kealoha
);

update victory_groups set is_test = true
  where id = '7b31881c-b419-4967-a24a-397ea0b6b5a9'; -- Upper Room Huddle
