-- ============================================================
-- MTOR Reservas — datos de ejemplo
-- ============================================================
-- Ejecutar DESPUÉS de schema.sql. Crea los tipos de clase, entrenadores,
-- planes y el horario semanal recurrente para que la app tenga contenido.

insert into class_types (name, category, default_capacity) values
  ('Funcional', 'grupal', 12),
  ('Spinning', 'grupal', 15),
  ('CrossTraining', 'grupal', 10),
  ('Entrenamiento personal', 'dos_uno', 2),
  ('Entrenamiento personal', 'tres_uno', 3);

insert into coaches (display_name) values
  ('Camila Rojas'),
  ('Rodrigo Paz'),
  ('Pablo Iturra'),
  ('Fernanda Ibáñez');

insert into plans (name, category, sessions_count, price, duration_days) values
  ('Plan Funcional 8', 'grupal', 8, 45000, 30),
  ('Plan Funcional 12', 'grupal', 12, 58000, 30),
  ('Personal 2:1 x4', 'dos_uno', 4, 70000, 30),
  ('Personal 2:1 x8', 'dos_uno', 8, 130000, 30),
  ('Personal 3:1 x4', 'tres_uno', 4, 55000, 30),
  ('Personal 3:1 x8', 'tres_uno', 8, 98000, 30);

-- Horario semanal recurrente (0 = lunes ... 5 = sábado, el gimnasio cierra domingo)
insert into schedule_templates (class_type_id, coach_id, weekday, start_time, capacity, room)
select ct.id, c.id, tpl.weekday, tpl.start_time::time, tpl.capacity, tpl.room
from (values
  -- Lunes
  ('Funcional', 'grupal', 'Camila Rojas', 0, '07:00', 12, 'Sala 1'),
  ('Entrenamiento personal', 'dos_uno', 'Rodrigo Paz', 0, '08:00', 2, 'Box'),
  ('Entrenamiento personal', 'tres_uno', 'Rodrigo Paz', 0, '09:00', 3, 'Box'),
  ('Spinning', 'grupal', 'Pablo Iturra', 0, '18:00', 15, 'Sala 2'),
  ('Funcional', 'grupal', 'Camila Rojas', 0, '19:00', 12, 'Sala 1'),
  ('Entrenamiento personal', 'dos_uno', 'Fernanda Ibáñez', 0, '20:00', 2, 'Box'),
  -- Martes
  ('CrossTraining', 'grupal', 'Pablo Iturra', 1, '07:30', 10, 'Sala 2'),
  ('Entrenamiento personal', 'tres_uno', 'Fernanda Ibáñez', 1, '09:00', 3, 'Box'),
  ('Funcional', 'grupal', 'Camila Rojas', 1, '18:00', 12, 'Sala 1'),
  ('Spinning', 'grupal', 'Pablo Iturra', 1, '19:00', 15, 'Sala 2'),
  ('Entrenamiento personal', 'dos_uno', 'Rodrigo Paz', 1, '20:00', 2, 'Box'),
  -- Miércoles
  ('Funcional', 'grupal', 'Camila Rojas', 2, '07:00', 12, 'Sala 1'),
  ('Entrenamiento personal', 'dos_uno', 'Rodrigo Paz', 2, '08:00', 2, 'Box'),
  ('Entrenamiento personal', 'tres_uno', 'Rodrigo Paz', 2, '09:00', 3, 'Box'),
  ('Spinning', 'grupal', 'Pablo Iturra', 2, '18:00', 15, 'Sala 2'),
  ('Funcional', 'grupal', 'Camila Rojas', 2, '19:00', 12, 'Sala 1'),
  ('Entrenamiento personal', 'dos_uno', 'Fernanda Ibáñez', 2, '20:00', 2, 'Box'),
  -- Jueves
  ('CrossTraining', 'grupal', 'Pablo Iturra', 3, '07:30', 10, 'Sala 2'),
  ('Entrenamiento personal', 'tres_uno', 'Fernanda Ibáñez', 3, '09:00', 3, 'Box'),
  ('Funcional', 'grupal', 'Camila Rojas', 3, '18:00', 12, 'Sala 1'),
  ('Spinning', 'grupal', 'Pablo Iturra', 3, '19:00', 15, 'Sala 2'),
  ('Entrenamiento personal', 'dos_uno', 'Rodrigo Paz', 3, '20:00', 2, 'Box'),
  -- Viernes
  ('Funcional', 'grupal', 'Camila Rojas', 4, '07:00', 12, 'Sala 1'),
  ('CrossTraining', 'grupal', 'Pablo Iturra', 4, '18:00', 10, 'Sala 2'),
  ('Entrenamiento personal', 'tres_uno', 'Rodrigo Paz', 4, '19:00', 3, 'Box'),
  ('Spinning', 'grupal', 'Pablo Iturra', 4, '20:00', 15, 'Sala 2'),
  -- Sábado
  ('Funcional', 'grupal', 'Camila Rojas', 5, '09:00', 12, 'Sala 1'),
  ('Entrenamiento personal', 'dos_uno', 'Rodrigo Paz', 5, '10:00', 2, 'Box'),
  ('CrossTraining', 'grupal', 'Pablo Iturra', 5, '11:00', 10, 'Sala 2')
) as tpl(class_type_name, category, coach_name, weekday, start_time, capacity, room)
join class_types ct
  on ct.name = tpl.class_type_name and ct.category = tpl.category::class_category
join coaches c on c.display_name = tpl.coach_name;
