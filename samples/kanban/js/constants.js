export const STATUSES = [
  { value: 0,  key: 'NOTSTARTED',         label: 'Not Started',         headerBg: '#f1f5f9', headerText: '#475569', cardBorder: '#94a3b8' },
  { value: 1,  key: 'AWAITINGACCEPTANCE', label: 'Awaiting Acceptance', headerBg: '#fffbeb', headerText: '#92400e', cardBorder: '#f59e0b' },
  { value: 2,  key: 'ACCEPTED',           label: 'Accepted',            headerBg: '#f0fdf4', headerText: '#166534', cardBorder: '#22c55e' },
  { value: 3,  key: 'REJECTED',           label: 'Rejected',            headerBg: '#fef2f2', headerText: '#991b1b', cardBorder: '#ef4444' },
  { value: 4,  key: 'ACTIVE',             label: 'Active',              headerBg: '#eff6ff', headerText: '#1e40af', cardBorder: '#3b82f6' },
  { value: 5,  key: 'INACTIVE',           label: 'Inactive',            headerBg: '#f9fafb', headerText: '#4b5563', cardBorder: '#9ca3af' },
  { value: 6,  key: 'FEEDBACKREQUIRED',   label: 'Feedback Required',   headerBg: '#fff7ed', headerText: '#9a3412', cardBorder: '#f97316' },
  { value: 7,  key: 'TESTING',            label: 'Testing',             headerBg: '#faf5ff', headerText: '#6b21a8', cardBorder: '#a855f7' },
  { value: 8,  key: 'CANCELLED',          label: 'Cancelled',           headerBg: '#fff1f2', headerText: '#9f1239', cardBorder: '#fb7185' },
  { value: 9,  key: 'COMPLETED',          label: 'Completed',           headerBg: '#ecfdf5', headerText: '#065f46', cardBorder: '#10b981' },
  { value: 10, key: 'FAILED',             label: 'Failed',              headerBg: '#fef2f2', headerText: '#7f1d1d', cardBorder: '#dc2626' },
  { value: 11, key: 'BOOKED',             label: 'Booked',              headerBg: '#f0fdfa', headerText: '#134e4a', cardBorder: '#14b8a6' },
];

export const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.value, s]));

export const PRIORITIES = [
  { value: 0, label: 'Lowest',  symbol: '↓↓', color: '#94a3b8' },
  { value: 1, label: 'Low',     symbol: '↓',  color: '#60a5fa' },
  { value: 2, label: 'Medium',  symbol: '→',  color: '#4ade80' },
  { value: 3, label: 'High',    symbol: '↑',  color: '#fb923c' },
  { value: 4, label: 'Highest', symbol: '↑↑', color: '#f87171' },
];

export const PRIORITY_MAP = Object.fromEntries(PRIORITIES.map(p => [p.value, p]));

export const TICKET_FIELDS = [
  { key: 'name',         label: 'Name' },
  { key: 'ticketnum',    label: 'Ticket #' },
  { key: 'description',  label: 'Description' },
  { key: 'assigneduser', label: 'Assigned User' },
  { key: 'duedate',      label: 'Due Date' },
  { key: 'priority',     label: 'Priority' },
  { key: 'status',       label: 'Status' },
  { key: 'account',      label: 'Account' },
  { key: 'project',      label: 'Project' },
  { key: 'creationdate', label: 'Created' },
  { key: 'lastmodified', label: 'Last Modified' },
];
