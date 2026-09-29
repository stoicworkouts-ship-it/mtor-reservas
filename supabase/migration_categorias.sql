-- ============================================================
-- MTOR Reservas — agrega categorías 1:1 / 4:1 y permisos de admin
-- ============================================================
-- Ejecutar en el SQL Editor de Supabase.

alter type class_category add value if not exists 'uno_uno' before 'dos_uno';
alter type class_category add value if not exists 'cuatro_uno' after 'tres_uno';

-- El schema original solo dejaba LEER estas tablas. Ahora que el admin
-- va a crear/editar tipos de clase, entrenadores, horario y planes desde
-- la app, hace falta darle permiso de escritura (solo a admin).
create policy "admin gestiona tipos de clase" on class_types for all using (is_admin()) with check (is_admin());
create policy "admin gestiona entrenadores" on coaches for all using (is_admin()) with check (is_admin());
create policy "admin gestiona horario" on schedule_templates for all using (is_admin()) with check (is_admin());
create policy "admin gestiona catalogo de planes" on plans for all using (is_admin()) with check (is_admin());
