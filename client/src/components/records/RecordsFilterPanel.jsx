import { useEffect, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  SORT_OPTIONS,
  sortStateToValue,
  sortValueToState
} from '../../utils/recordQuery.mjs';

export default function RecordsFilterPanel({
  open,
  users = [],
  initialFilters = DEFAULT_FILTERS,
  initialSort = DEFAULT_SORT,
  onApply,
  onReset,
  onClose
}) {
  const [draftFilters, setDraftFilters] = useState({ ...DEFAULT_FILTERS });
  const [draftSort, setDraftSort] = useState({ ...DEFAULT_SORT });

  useEffect(() => {
    if (!open) return;
    setDraftFilters({ ...DEFAULT_FILTERS, ...initialFilters });
    setDraftSort({ ...DEFAULT_SORT, ...initialSort });
  }, [open, initialFilters, initialSort]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const amountError = draftFilters.minAmount !== '' &&
    draftFilters.maxAmount !== '' &&
    Number(draftFilters.minAmount) > Number(draftFilters.maxAmount);
  const submittedError = draftFilters.startDate && draftFilters.endDate &&
    draftFilters.startDate > draftFilters.endDate;
  const paidBackError = draftFilters.paidBackStartDate && draftFilters.paidBackEndDate &&
    draftFilters.paidBackStartDate > draftFilters.paidBackEndDate;
  const hasErrors = amountError || submittedError || paidBackError;

  const updateFilter = (key, value) => {
    setDraftFilters((previous) => ({ ...previous, [key]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (hasErrors) return;
    onApply({ filters: { ...draftFilters }, sort: { ...draftSort } });
  };

  const wrapperClass = 'ar-filter-panel';

  return (
    <div className="ar-panel-overlay" onClick={onClose}>
      <aside
        className={wrapperClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ar-filter-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ar-panel-header">
          <div>
            <h3 className="ar-panel-title" id="ar-filter-title">
              <SlidersHorizontal size={17} aria-hidden="true" /> Advanced filters
            </h3>
            <p className="ar-panel-subtitle">Filters combine with search and status.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close filters">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="ar-filter-form">
          <div className="ar-panel-body">
            <div className="ar-filter-section">
              <label className="form-label" htmlFor="ar-filter-user">User</label>
              <select
                id="ar-filter-user"
                className="form-select"
                value={draftFilters.userId}
                onChange={(event) => updateFilter('userId', event.target.value)}
              >
                <option value="">All users</option>
                {users.map((user) => (
                  <option key={user._id || user.id} value={user._id || user.id}>
                    {user.name}{user.email ? ` (${user.email})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="ar-filter-section">
              <span className="form-label" id="ar-filter-sharing-label">Sharing</span>
              <div className="ar-segmented" role="group" aria-labelledby="ar-filter-sharing-label">
                {[
                  { value: '', label: 'All' },
                  { value: 'shared', label: 'Shared' },
                  { value: 'unshared', label: 'Unshared' }
                ].map((option) => (
                  <button
                    key={option.value || 'all'}
                    type="button"
                    className={draftFilters.shared === option.value ? 'active' : ''}
                    aria-pressed={draftFilters.shared === option.value}
                    onClick={() => updateFilter('shared', option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <fieldset className="ar-filter-section ar-fieldset">
              <legend className="form-label">Submission date</legend>
              <div className="ar-filter-grid">
                <label className="ar-field" htmlFor="ar-filter-start">
                  <span>From</span>
                  <input
                    id="ar-filter-start"
                    type="date"
                    className={`form-input form-input-date ${submittedError ? 'is-invalid' : ''}`}
                    value={draftFilters.startDate}
                    onChange={(event) => updateFilter('startDate', event.target.value)}
                  />
                </label>
                <label className="ar-field" htmlFor="ar-filter-end">
                  <span>To</span>
                  <input
                    id="ar-filter-end"
                    type="date"
                    className={`form-input form-input-date ${submittedError ? 'is-invalid' : ''}`}
                    value={draftFilters.endDate}
                    onChange={(event) => updateFilter('endDate', event.target.value)}
                  />
                </label>
              </div>
              {submittedError && <small className="ar-field-error">Start date must be before the end date.</small>}
            </fieldset>

            <fieldset className="ar-filter-section ar-fieldset">
              <legend className="form-label">Payment-back date</legend>
              <div className="ar-filter-grid">
                <label className="ar-field" htmlFor="ar-filter-paid-start">
                  <span>From</span>
                  <input
                    id="ar-filter-paid-start"
                    type="date"
                    className={`form-input form-input-date ${paidBackError ? 'is-invalid' : ''}`}
                    value={draftFilters.paidBackStartDate}
                    onChange={(event) => updateFilter('paidBackStartDate', event.target.value)}
                  />
                </label>
                <label className="ar-field" htmlFor="ar-filter-paid-end">
                  <span>To</span>
                  <input
                    id="ar-filter-paid-end"
                    type="date"
                    className={`form-input form-input-date ${paidBackError ? 'is-invalid' : ''}`}
                    value={draftFilters.paidBackEndDate}
                    onChange={(event) => updateFilter('paidBackEndDate', event.target.value)}
                  />
                </label>
              </div>
              {paidBackError && <small className="ar-field-error">Start date must be before the end date.</small>}
            </fieldset>

            <fieldset className="ar-filter-section ar-fieldset">
              <legend className="form-label">Gift card amount</legend>
              <div className="ar-filter-grid">
                <label className="ar-field" htmlFor="ar-filter-min">
                  <span>Minimum (₹)</span>
                  <input
                    id="ar-filter-min"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    className={`form-input ${amountError ? 'is-invalid' : ''}`}
                    value={draftFilters.minAmount}
                    onChange={(event) => updateFilter('minAmount', event.target.value)}
                    placeholder="No minimum"
                  />
                </label>
                <label className="ar-field" htmlFor="ar-filter-max">
                  <span>Maximum (₹)</span>
                  <input
                    id="ar-filter-max"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    className={`form-input ${amountError ? 'is-invalid' : ''}`}
                    value={draftFilters.maxAmount}
                    onChange={(event) => updateFilter('maxAmount', event.target.value)}
                    placeholder="No maximum"
                  />
                </label>
              </div>
              {amountError && <small className="ar-field-error">Minimum amount cannot exceed the maximum.</small>}
            </fieldset>

            <div className="ar-filter-section">
              <label className="form-label" htmlFor="ar-filter-sort">Sort by</label>
              <select
                id="ar-filter-sort"
                className="form-select"
                value={sortStateToValue(draftSort)}
                onChange={(event) => setDraftSort(sortValueToState(event.target.value))}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="ar-panel-footer">
            <button type="button" className="btn btn-outline" onClick={onReset}>Reset all</button>
            <div className="ar-panel-footer-right">
              <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={hasErrors}>Apply filters</button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}
