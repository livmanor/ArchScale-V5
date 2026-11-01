import React, { useState, useMemo } from 'react';
import { EmptyState } from './EmptyState';
import { Button } from './Button';
import { Alert } from './Alert';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Column<T = Record<string, unknown>> {
  key: string;
  label: string;
  sortable?: boolean;
  width?: number | string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T extends Record<string, any>> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => React.ReactNode;
  keyField?: string;
  searchKeys?: (keyof T)[];
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyAction?: React.ReactNode;
  pageSize?: number;
}

const TH: React.CSSProperties = {
  height: 44,
  padding: '0 16px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  color: '#475467',
  background: '#fafbfc',
  borderBottom: '1px solid var(--color-border)',
  position: 'sticky',
  top: 0,
  zIndex: 1,
  whiteSpace: 'nowrap',
  letterSpacing: '0.2px',
  userSelect: 'none',
};

const TD: React.CSSProperties = {
  height: 'var(--row-height)',
  padding: '0 16px',
  fontSize: 13,
  borderBottom: '1px solid var(--color-border-subtle)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 280,
  color: 'var(--color-text)',
};

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={TD}>
          <div style={{
            height: 14,
            borderRadius: 4,
            background: 'var(--color-border)',
            width: `${50 + (i * 17) % 40}%`,
            animation: 'pulse 1.4s ease-in-out infinite',
          }} />
        </td>
      ))}
    </tr>
  );
}

export function DataTable<T extends Record<string, any>>({
  columns, data, loading, error, onRetry, onRowClick, rowActions,
  keyField = 'id', searchKeys, emptyTitle = 'No data', emptySubtitle,
  emptyAction, pageSize = 25,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!search || !searchKeys) return data;
    const q = search.toLowerCase();
    return data.filter(row =>
      searchKeys.some(k => String(row[k as string] ?? '').toLowerCase().includes(q))
    );
  }, [data, search, searchKeys]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = String(a[sortKey] ?? '');
      const bv = String(b[sortKey] ?? '');
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const hasActions = !!rowActions;
  const colCount = columns.length + (hasActions ? 1 : 0);

  return (
    <div>
      {/* Search & Actions Bar */}
      {searchKeys && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ position: 'relative', width: 280 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#98a2b3', fontSize: 13 }}>🔍</span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search..."
              style={{
                width: '100%',
                height: 38,
                padding: '0 12px 0 34px',
                border: '1px solid #d0d5dd',
                borderRadius: 'var(--radius)',
                fontSize: 13,
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                outline: 'none',
                boxShadow: 'var(--shadow-xs)',
                transition: 'border-color var(--transition), box-shadow var(--transition)',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'var(--color-accent)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249, 115, 22, 0.15)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = '#d0d5dd';
                e.currentTarget.style.boxShadow = 'var(--shadow-xs)';
              }}
            />
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <Alert kind="error">
          {error}
          {onRetry && (
            <Button variant="ghost" size="sm" onClick={onRetry} style={{ marginLeft: 8, color: 'var(--color-error)' }}>
              Retry
            </Button>
          )}
        </Alert>
      )}

      {/* Table Container */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-xs)',
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 600 }}>
            <thead>
              <tr>
                {columns.map(col => (
                  <th
                    key={col.key}
                    style={{ ...TH, width: col.width, cursor: col.sortable ? 'pointer' : 'default' }}
                    onClick={() => col.sortable && toggleSort(col.key)}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span>{col.label}</span>
                      {col.sortable && (
                        <span style={{ fontSize: 11, color: sortKey === col.key ? 'var(--color-accent)' : '#98a2b3' }}>
                          {sortKey === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
                {hasActions && <th style={{ ...TH, width: 80, textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={colCount} />)
                : !error && paged.length === 0
                  ? (
                    <tr>
                      <td colSpan={colCount}>
                        <EmptyState title={emptyTitle} subtitle={emptySubtitle} action={emptyAction} />
                      </td>
                    </tr>
                  )
                  : paged.map(row => (
                    <tr
                      key={String(row[keyField])}
                      onClick={() => onRowClick?.(row)}
                      style={{ cursor: onRowClick ? 'pointer' : 'default', transition: 'background var(--transition)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--color-surface-hover)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
                    >
                      {columns.map(col => (
                        <td key={col.key} style={TD} title={col.render ? undefined : String(row[col.key] ?? '')}>
                          {col.render ? col.render(row) : String(row[col.key] ?? '')}
                        </td>
                      ))}
                      {hasActions && (
                        <td style={{ ...TD, overflow: 'visible', textAlign: 'right', maxWidth: 'none' }} onClick={e => e.stopPropagation()}>
                          {rowActions!(row)}
                        </td>
                      )}
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {!loading && !error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderTop: '1px solid var(--color-border)',
            background: '#fafbfc',
            fontSize: 13,
            color: 'var(--color-text-muted)',
          }}>
            <span>Showing {sorted.length === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, sorted.length)} of {sorted.length} entries</span>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  ‹ Previous
                </Button>
                <div style={{ display: 'flex', gap: 4, margin: '0 4px' }}>
                  {Array.from({ length: Math.min(5, totalPages) }).map((_, idx) => {
                    const pNum = idx + 1;
                    const isCur = page === pNum;
                    return (
                      <button
                        key={pNum}
                        onClick={() => setPage(pNum)}
                        style={{
                          minWidth: 28,
                          height: 28,
                          borderRadius: 6,
                          border: isCur ? '1px solid var(--color-accent)' : '1px solid transparent',
                          background: isCur ? 'var(--color-accent-light)' : 'transparent',
                          color: isCur ? 'var(--color-accent)' : 'var(--color-text)',
                          fontWeight: isCur ? 600 : 400,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        {pNum}
                      </button>
                    );
                  })}
                </div>
                <Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                  Next ›
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
