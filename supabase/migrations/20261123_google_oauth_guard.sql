-- =============================================================================
-- StarOps Migration: 20261123_google_oauth_guard.sql
-- Internal-App Google OAuth Guard on `public.handle_new_user()`
--
-- Prevents unregistered strangers who click "Masuk dengan Google" from gaining
-- an active StarOps profile:
--   - First bootstrap user (empty `public.profiles`): OWNER, `is_active = true`.
--   - Admin-created / invited email users (`provider = 'email'`): `is_active = true`.
--   - Existing users linking Google via `linkIdentity()`: triggers `auth.identities`
--     only (never `on_auth_user_created`), so their active profile stays untouched.
--   - Unregistered OAuth strangers (`v_is_oauth_stranger = true`): created with
--     `is_active = false`, immediately blocked by RLS (`is_active_user()`) and
--     signed out + cleaned up by `/auth/callback`.
--
-- Safe & idempotent: mirrors the live database function.
-- =============================================================================

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_is_first_user boolean;
  v_provider text;
  v_is_oauth_stranger boolean;
begin
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );

  select not exists (select 1 from public.profiles) into v_is_first_user;

  v_provider := lower(coalesce(new.raw_app_meta_data ->> 'provider', 'email'));
  v_is_oauth_stranger := (not v_is_first_user) and (v_provider <> 'email');

  insert into public.profiles (id, full_name, email, role, is_active)
  values (
    new.id,
    v_name,
    lower(new.email),
    case when v_is_first_user then 'OWNER'::public.user_role else 'STAFF'::public.user_role end,
    not v_is_oauth_stranger
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;
