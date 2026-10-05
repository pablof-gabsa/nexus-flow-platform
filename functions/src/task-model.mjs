import { NexusError } from './validation.mjs';

export function calendarDay(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Same inclusive 8h Monday-Friday convention used by Utils.calculateBusinessHours.
export function businessHours(start, end) {
  const first = new Date(`${start}T12:00:00Z`), last = new Date(`${end}T12:00:00Z`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || first > last) return 0;
  const days = Math.round((last - first) / 86400_000) + 1;
  if (days === 1) return 8;
  let weekdays = Math.floor(days / 7) * 5;
  for (let offset = 0; offset < days % 7; offset++) { const day = (first.getUTCDay() + offset) % 7; if (day !== 0 && day !== 6) weekdays++; }
  return weekdays * 8;
}

export function taskChanges(current, input, now) {
  const changes = { ...input };
  const day = calendarDay(now);
  if (changes.estado && changes.estado !== current.estado) {
    if (changes.estado === 'En Proceso' && !current.real_start_date && changes.real_start_date === undefined) changes.real_start_date = day;
    if (changes.estado === 'Realizado' && changes.end_date === undefined) changes.end_date = day;
    else if (current.estado === 'Realizado' && changes.estado !== 'Realizado') {
      if (changes.end_date === undefined) changes.end_date = '';
      if (changes.hh_executed === undefined) changes.hh_executed = 0;
    }
  }
  const merged = { ...current, ...changes };
  if (changes.hh_estimated === undefined && ['start_date', 'deadline', 'resources'].some(key => key in changes) && merged.start_date && merged.deadline) {
    changes.hh_estimated = businessHours(merged.start_date, merged.deadline) * (merged.resources ?? 1);
  }
  if (changes.hh_executed === undefined && ['real_start_date', 'end_date', 'resources'].some(key => key in changes) && merged.real_start_date && merged.end_date) {
    changes.hh_executed = businessHours(merged.real_start_date, merged.end_date) * (merged.resources ?? 1);
  }
  if (changes.attachments) changes.attachments = changes.attachments.map(file => {
    if (file.existingIndex === undefined) return file;
    const existing = current.attachments?.[file.existingIndex];
    if (!existing) throw new NexusError(400, 'unknown_attachment', 'Consultá la tarea y usá un existingIndex válido para conservar el adjunto.');
    return existing;
  });
  return changes;
}

export function nextOccurrence(task, now) {
  const recurrence = task.recurrence;
  const base = task.deadline || calendarDay(now);
  const next = new Date(`${base}T12:00:00Z`);
  if (Number.isNaN(next.getTime())) throw new NexusError(400, 'invalid_recurrence', 'Corregí la fecha de la tarea recurrente antes de completarla.');
  if (recurrence.type === 'daily') next.setUTCDate(next.getUTCDate() + 1);
  else if (recurrence.type === 'weekly') {
    if (!recurrence.days?.length || recurrence.days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new NexusError(400, 'invalid_recurrence', 'Indicá los días de la repetición semanal antes de completarla.');
    do { next.setUTCDate(next.getUTCDate() + 1); } while (!recurrence.days.includes((next.getUTCDay() + 6) % 7));
  } else if (recurrence.type === 'monthly') {
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    if (recurrence.monthlyType === 'relative') {
      if (!Number.isInteger(recurrence.week) || recurrence.week < 1 || recurrence.week > 5 || !Number.isInteger(recurrence.dayOfWeek) || recurrence.dayOfWeek < 0 || recurrence.dayOfWeek > 6) throw new NexusError(400, 'invalid_recurrence', 'Corregí la repetición mensual antes de completarla.');
      const first = 1 + (recurrence.dayOfWeek - (next.getUTCDay() + 6) % 7 + 7) % 7;
      next.setUTCDate(recurrence.week === 5 ? first + Math.floor((lastDay - first) / 7) * 7 : first + (recurrence.week - 1) * 7);
    } else next.setUTCDate(Math.min(recurrence.day || 1, lastDay));
  } else if (recurrence.type === 'yearly') {
    const month = next.getUTCMonth(), day = next.getUTCDate();
    next.setUTCDate(1); next.setUTCFullYear(next.getUTCFullYear() + 1);
    next.setUTCDate(Math.min(day, new Date(Date.UTC(next.getUTCFullYear(), month + 1, 0)).getUTCDate()));
  } else if (recurrence.type === 'periodic') {
    next.setTime(new Date(`${calendarDay(now)}T12:00:00Z`).getTime());
    next.setUTCDate(next.getUTCDate() + (recurrence.interval || 1));
  } else throw new NexusError(400, 'invalid_recurrence', 'Corregí la repetición antes de completar la tarea.');
  const deadline = next.toISOString().slice(0, 10);
  const duration = task.start_date && task.deadline ? Date.parse(task.deadline) - Date.parse(task.start_date) : NaN;
  const start_date = Number.isFinite(duration) && duration >= 0 ? new Date(Date.parse(deadline) - duration).toISOString().slice(0, 10) : task.start_date || '';
  const value = { ...task, estado: 'Pendiente', deadline, start_date, real_start_date: '', end_date: '', hh_executed: 0, subtasks: (task.subtasks || []).map(point => ({ ...point, done: false })) };
  delete value.id;
  delete value._assistantNextTaskId;
  return value;
}
