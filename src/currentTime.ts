export function localNowPosition(day: Date, now: Date): number | null {
  if (
    day.getFullYear() !== now.getFullYear() ||
    day.getMonth() !== now.getMonth() ||
    day.getDate() !== now.getDate()
  )
    return null;
  return now.getHours() * 60 + now.getMinutes();
}
