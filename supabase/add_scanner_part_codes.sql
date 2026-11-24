-- Repair parts use the existing eight-digit Scanner-kode namespace and owner RLS.
-- The barcode is an identifier; the full part snapshot is stored under that identifier.
alter table public.scanner_codes
  add column if not exists part_data jsonb;

alter table public.scanner_codes
  add constraint scanner_part_record_check
  check (template_key <> 'part' or (
    status = 'unused' and used_at is null and part_data is not null
    and jsonb_typeof(part_data) = 'object'
  ));

-- Only these fields can be updated directly by a signed-in client. Voucher status
-- changes remain governed by their existing RPCs and policies.
grant update (label,note,barcode_svg,part_data,updated_at)
  on public.scanner_codes to authenticated;

create policy scanner_codes_update_part
  on public.scanner_codes for update to authenticated
  using (owner_id = (select auth.uid()) and template_key = 'part' and status = 'unused')
  with check (owner_id = (select auth.uid()) and template_key = 'part'
    and status = 'unused' and used_at is null and part_data is not null);
