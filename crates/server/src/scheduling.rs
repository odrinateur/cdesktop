use chrono::{DateTime, Datelike, Duration, Local, NaiveTime, TimeZone, Timelike, Utc, Weekday};
use db::models::routine::ScheduleKind;

/// Compute the next time a routine should fire, based on its schedule fields
/// and the local-wall-clock instant to compute relative to. Returns `None` for
/// disabled routines or `manual` kind, or if schedule fields are inconsistent.
///
/// Storage convention: result is in UTC. Local-TZ arithmetic happens inside.
pub fn compute_next_run_at(
    kind: ScheduleKind,
    time: Option<&str>,
    dow: Option<i64>,
    enabled: bool,
    from: DateTime<Local>,
) -> Option<DateTime<Utc>> {
    if !enabled {
        return None;
    }
    match kind {
        ScheduleKind::Manual => None,
        ScheduleKind::Hourly => {
            let mm: u32 = time?.parse().ok()?;
            if mm > 59 {
                return None;
            }
            let candidate = from
                .with_minute(mm)
                .and_then(|t| t.with_second(0))
                .and_then(|t| t.with_nanosecond(0))?;
            let candidate = if candidate <= from {
                candidate + Duration::hours(1)
            } else {
                candidate
            };
            Some(candidate.with_timezone(&Utc))
        }
        ScheduleKind::Daily => {
            let (h, m) = parse_hhmm(time?)?;
            let today = local_at(&from, h, m)?;
            let candidate = if today <= from {
                today + Duration::days(1)
            } else {
                today
            };
            Some(candidate.with_timezone(&Utc))
        }
        ScheduleKind::Weekdays => {
            let (h, m) = parse_hhmm(time?)?;
            let mut candidate = local_at(&from, h, m)?;
            if candidate <= from {
                candidate += Duration::days(1);
            }
            while is_weekend(candidate.weekday()) {
                candidate += Duration::days(1);
            }
            Some(candidate.with_timezone(&Utc))
        }
        ScheduleKind::Weekly => {
            let (h, m) = parse_hhmm(time?)?;
            let target_dow = dow
                .and_then(|d| u32::try_from(d).ok())
                .filter(|d| *d <= 6)?;
            let mut candidate = local_at(&from, h, m)?;
            let target = weekday_from_num(target_dow);
            for _ in 0..8 {
                if candidate.weekday() == target && candidate > from {
                    return Some(candidate.with_timezone(&Utc));
                }
                candidate += Duration::days(1);
            }
            None
        }
    }
}

fn parse_hhmm(s: &str) -> Option<(u32, u32)> {
    let (h, m) = s.split_once(':')?;
    let h: u32 = h.parse().ok()?;
    let m: u32 = m.parse().ok()?;
    if h > 23 || m > 59 {
        return None;
    }
    Some((h, m))
}

fn local_at(from: &DateTime<Local>, h: u32, m: u32) -> Option<DateTime<Local>> {
    let date = from.date_naive();
    let time = NaiveTime::from_hms_opt(h, m, 0)?;
    Local
        .from_local_datetime(&date.and_time(time))
        .single()
        .or_else(|| Local.from_local_datetime(&date.and_time(time)).earliest())
}

fn is_weekend(w: Weekday) -> bool {
    matches!(w, Weekday::Sat | Weekday::Sun)
}

fn weekday_from_num(n: u32) -> Weekday {
    match n {
        0 => Weekday::Sun,
        1 => Weekday::Mon,
        2 => Weekday::Tue,
        3 => Weekday::Wed,
        4 => Weekday::Thu,
        5 => Weekday::Fri,
        6 => Weekday::Sat,
        _ => Weekday::Sun,
    }
}

#[cfg(test)]
mod tests {
    use chrono::{NaiveDate, NaiveDateTime};

    use super::*;

    fn local(y: i32, mo: u32, d: u32, h: u32, mi: u32) -> DateTime<Local> {
        let nd = NaiveDate::from_ymd_opt(y, mo, d).unwrap();
        let nt = NaiveTime::from_hms_opt(h, mi, 0).unwrap();
        let ndt = NaiveDateTime::new(nd, nt);
        Local.from_local_datetime(&ndt).unwrap()
    }

    #[test]
    fn manual_returns_none() {
        let r = compute_next_run_at(
            ScheduleKind::Manual,
            None,
            None,
            true,
            local(2026, 5, 16, 12, 0),
        );
        assert!(r.is_none());
    }

    #[test]
    fn disabled_returns_none() {
        let r = compute_next_run_at(
            ScheduleKind::Daily,
            Some("09:00"),
            None,
            false,
            local(2026, 5, 16, 12, 0),
        );
        assert!(r.is_none());
    }

    #[test]
    fn hourly_picks_next_top_at_mm() {
        let r = compute_next_run_at(
            ScheduleKind::Hourly,
            Some("15"),
            None,
            true,
            local(2026, 5, 16, 12, 0),
        )
        .unwrap()
        .with_timezone(&Local);
        assert_eq!((r.hour(), r.minute()), (12, 15));
    }

    #[test]
    fn hourly_advances_when_past() {
        let r = compute_next_run_at(
            ScheduleKind::Hourly,
            Some("15"),
            None,
            true,
            local(2026, 5, 16, 12, 30),
        )
        .unwrap()
        .with_timezone(&Local);
        assert_eq!((r.hour(), r.minute()), (13, 15));
    }

    #[test]
    fn daily_today_when_future() {
        let r = compute_next_run_at(
            ScheduleKind::Daily,
            Some("18:00"),
            None,
            true,
            local(2026, 5, 16, 9, 0),
        )
        .unwrap()
        .with_timezone(&Local);
        assert_eq!(r.day(), 16);
    }

    #[test]
    fn daily_tomorrow_when_past() {
        let r = compute_next_run_at(
            ScheduleKind::Daily,
            Some("06:00"),
            None,
            true,
            local(2026, 5, 16, 9, 0),
        )
        .unwrap()
        .with_timezone(&Local);
        assert_eq!(r.day(), 17);
        assert_eq!((r.hour(), r.minute()), (6, 0));
    }

    #[test]
    fn weekdays_skips_saturday_to_monday() {
        // 2026-05-16 is a Saturday.
        let r = compute_next_run_at(
            ScheduleKind::Weekdays,
            Some("09:00"),
            None,
            true,
            local(2026, 5, 16, 6, 0),
        )
        .unwrap()
        .with_timezone(&Local);
        assert_eq!(r.weekday(), Weekday::Mon);
        assert_eq!((r.hour(), r.minute()), (9, 0));
    }

    #[test]
    fn weekly_picks_next_occurrence_of_dow() {
        // dow=3 => Wednesday
        let r = compute_next_run_at(
            ScheduleKind::Weekly,
            Some("12:00"),
            Some(3),
            true,
            local(2026, 5, 16, 6, 0),
        )
        .unwrap()
        .with_timezone(&Local);
        assert_eq!(r.weekday(), Weekday::Wed);
    }
}
