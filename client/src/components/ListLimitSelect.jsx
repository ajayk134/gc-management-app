import { LIST_LIMIT_OPTIONS, normalizeListLimit } from '../utils/listLimits';

export default function ListLimitSelect({
  id,
  value,
  onChange,
  label = 'Show',
  disabled = false,
  inline = false,
  className = ''
}) {
  const selectId = id || `list-limit-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const classes = ['list-limit-select', inline ? 'list-limit-select-inline' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <label className={classes} htmlFor={selectId}>
      <span className="list-limit-label">{label}</span>
      <select
        id={selectId}
        className="form-select form-select-sm"
        value={value}
        disabled={disabled}
        onChange={event => onChange(normalizeListLimit(event.target.value))}
      >
        {LIST_LIMIT_OPTIONS.map(option => (
          <option key={option} value={option}>{option === 'all' ? 'All' : option}</option>
        ))}
      </select>
    </label>
  );
}
