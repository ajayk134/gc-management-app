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
          <strong>Maintenance mode is on.</strong>{' '}
          {downtime?.message || 'New gift card submissions are temporarily paused. You can still sign in and view existing records.'}
          {downtime?.startAt && (
            <span className="downtime-ribbon-since"> Since {formatDateTime(downtime.startAt)}.</span>
          )}
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
