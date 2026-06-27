-- Grace Group focus: which booklet the group takes people through. Maps to a
-- 4E stage (One2One/Church Community -> Establish, Making Disciples -> Equip,
-- Empowering Leadership -> Empower) so group members can be counted by stage.

alter table victory_groups
  add column if not exists focus text;
