import { CalendarClock, Wrench } from 'lucide-react';
import { useDowntime } from '../context/DowntimeContext';
import { formatDateTime } from '../utils/format';

export default function DowntimeRibbon({ showActive = false }) {
  const { active, downtime, upcoming, loading } = useDowntime();

  if (loading) return null;

  if (active && showActive) {
    return (
      <div className="downtime-ribbon downtime-ribbon-live" role="status">
        <span className="downtime-ribbon-icon" aria-hidden="true"><Wrench size={15} /></span>
        <span className="downtime-ribbon-text">
          <strong>Maintenance in progress.</strong>{' '}
          Admin access remains available until {formatDateTime(downtime?.endAt)}.
        </span>
      </div>
    );
  }

  if (active) return null;

  if (!upcoming) return null;

  return (
    <div className="downtime-ribbon" role="status">
      <span className="downtime-ribbon-icon" aria-hidden="true"><CalendarClock size={15} /></span>
      <span className="downtime-ribbon-text">
        <strong>Scheduled maintenance:</strong>{' '}
        {formatDateTime(upcoming.startAt)} &ndash; {formatDateTime(upcoming.endAt)}
        {upcoming.title ? ` (${upcoming.title})` : ''}
      </span>
    </div>
  );
}
