-- ============================================================
-- MTOR Reservas — borra TODOS los datos de ejemplo (seed) para
-- partir de cero y crear tus propios planes, clases y horario
-- desde el Panel admin.
-- ============================================================
-- Ejecutar en el SQL Editor de Supabase.
--
-- Qué SÍ borra: tipos de clase, entrenadores, horario semanal,
-- planes, sesiones generadas, reservas, comprobantes de pago y
-- los planes asignados a usuarios.
--
-- Qué NO borra: las cuentas de usuario (profiles / auth.users),
-- así que nadie pierde su acceso ni su rol de admin.
--
-- Orden importante: primero lo que depende de otras tablas,
-- al final lo que no depende de nada.

delete from reservations;
delete from payments;
delete from user_plans;
delete from sessions;
delete from schedule_templates;
delete from plans;
delete from coaches;
delete from class_types;

-- Listo. El Panel admin ahora debería mostrar todas las secciones
-- vacías: Tipos de clase, Entrenadores, Horario semanal y Planes.
-- Puedes empezar a crear los tuyos desde ahí, en este orden:
--   1. Tipos de clase (ej: "Funcional", categoría Grupal)
--   2. Entrenadores
--   3. Horario semanal (bloques que usan un tipo de clase y, si
--      corresponde, un entrenador)
--   4. Planes (el catálogo que los clientes pueden comprar)
-- Después usa el botón "Actualizar calendario ahora" en la pestaña
-- Horario para generar las sesiones reales del calendario.
