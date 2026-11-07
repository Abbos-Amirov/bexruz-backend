/**
 * Admin va afitsant sessiyalari har kuni bir vaqtda (sukut: 07:00, Asia/Seoul) tugaydi.
 * Server UTC da ishlagani uchun vaqt mintaqasi aniq ko'rsatiladi.
 * .env: SESSION_RESET_HOUR=7, SESSION_TZ=Asia/Seoul
 */
const RESET_HOUR = Number(process.env.SESSION_RESET_HOUR ?? 7);
const TIME_ZONE = process.env.SESSION_TZ || "Asia/Seoul";

/** Berilgan mintaqadagi "devor soati" komponentlari */
function wallClock(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Keyingi RESET_HOUR:00 gacha qolgan soniyalar (kamida 60) */
export function secondsUntilSessionReset(now: Date = new Date()): number {
  const w = wallClock(now);
  const nowWall = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  let target = Date.UTC(w.year, w.month - 1, w.day, RESET_HOUR, 0, 0);
  if (target <= nowWall) target += 24 * 60 * 60 * 1000;
  return Math.max(60, Math.round((target - nowWall) / 1000));
}
