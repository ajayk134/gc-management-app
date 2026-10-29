import { ChevronDown } from 'lucide-react';

export default function SectionToggle({
  expanded,
  onClick,
  controls,
  label,
  className = ''
}) {
  const action = expanded ? 'Collapse' : 'Expand';
  return (
    <button
      type="button"
      className={`section-collapse-btn ${expanded ? 'is-expanded' : ''} ${className}`.trim()}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={`${action} ${label}`}
      title={`${action} ${label}`}
      onClick={onClick}
    >
      <ChevronDown size={18} aria-hidden="true" />
    </button>
  );
}
