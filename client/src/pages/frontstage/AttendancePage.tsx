import React, { useEffect, useState, useCallback } from 'react';
import { getAttendance, checkInAttendance, checkOutAttendance, updateAttendance, commentAttendance } from '../../api/client';
import { DataTable, Column } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Badge, statusVariant } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Drawer } from '../../components/Drawer';
import { FormField, SelectInput, TextareaInput, TextInput } from '../../components/FormField';
import { Alert } from '../../components/Alert';
import { useToast } from '../../hooks/useToast';
import { ToastList } from '../../components/Toast';
import { useSession } from '../../hooks/useSession';

/* eslint-disable @typescript-eslint/no-explicit-any */

const STATUSES = ['Present', 'Absent', 'Half Day', 'Leave', 'Holiday', 'Work From Home'];

export const AttendancePage: React.FC = () => {
  const { session, context } = useSession();
  const { toasts, addToast, removeToast } = useToast();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // RBAC checks
  const activeRole = context?.roleKey;
  const activeDept = context?.department;
  const isSupportReadOnly = !!context?.supportGrantId;
  const isHRManager = activeDept === 'HR' && activeRole === 'manager_coordinator';
  const isJuniorHR = activeDept === 'HR' && activeRole === 'intern';
  const isSelfService = !!context?.membershipId && context.portal === 'subscriber' && !isSupportReadOnly;
  const isAuthorized = isHRManager || isJuniorHR || isSupportReadOnly || isSelfService;
  const canComment = isHRManager || isJuniorHR;

  // Detail drawer
  const [selected, setSelected] = useState<any | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [clocking, setClocking] = useState(false);
  const [today, setToday] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getAttendance();
    setLoading(false);
    if (!res.ok) { setError(res.message); return; }
    setRecords(res.data?.records ?? []);
    setToday(res.data?.today ?? '');
  }, []);

  useEffect(() => {
    if (isAuthorized) {
      load();
    } else {
      setLoading(false);
      setError('Section 11 Attendance Policy: Access Denied. Attendance records are strictly restricted to the HR department and audited Super Admins.');
    }
  }, [load, isAuthorized]);

  const openRecord = (rec: any) => {
    setSelected(rec);
    setEditStatus(rec.status);
    setCheckIn(rec.checkInTime ?? '');
    setCheckOut(rec.checkOutTime ?? '');
    setComment('');
  };

  const handleSave = async () => {
    if (!selected || !isHRManager) return;
    setSaving(true);
    const res = await updateAttendance(selected.id, {
      status: editStatus,
      checkInTime: checkIn || undefined,
      checkOutTime: checkOut || undefined,
    });
    setSaving(false);
    if (!res.ok) { addToast('error', res.message); return; }
    addToast('success', 'Attendance record updated successfully');
    setSelected(null);
    load();
  };

  const handleCheckIn = async () => {
    setClocking(true);
    const res = await checkInAttendance();
    setClocking(false);
    if (!res.ok) { addToast('error', res.message); return; }
    addToast('success', 'Check-in recorded');
    await load();
  };

  const handleCheckOut = async () => {
    setClocking(true);
    const res = await checkOutAttendance();
    setClocking(false);
    if (!res.ok) { addToast('error', res.message); return; }
    addToast('success', 'Check-out recorded');
    await load();
  };

  const handleComment = async () => {
    if (!selected || !canComment || !comment.trim()) return;
    setCommenting(true);
    const res = await commentAttendance(selected.id, comment.trim());
    setCommenting(false);
    if (!res.ok) { addToast('error', res.message); return; }
    addToast('success', 'HR Comment added');
    setComment('');
    // Reload to get fresh comments
    const freshRes = await getAttendance();
    if (freshRes.ok) {
      const freshRecord = (freshRes.data?.records ?? []).find((r: any) => r.id === selected.id);
      if (freshRecord) setSelected(freshRecord);
    }
  };

  const todayRecord = records.find(record =>
    record.memberId === context?.membershipId && String(record.date).slice(0, 10) === today
  );

  const columns: Column<any>[] = [
    { key: 'attendanceId', label: 'Attendance ID', width: 120, render: row => row.attendanceId || row.id },
    { key: 'memberName', label: 'Team Member', sortable: true, width: 180 },
    { key: 'department', label: 'Department', sortable: true, width: 120 },
    { key: 'date', label: 'Date', sortable: true, width: 110, render: row =>
        row.date ? new Date(row.date).toLocaleDateString() : '—'
    },
    { key: 'status', label: 'Status', width: 130, render: row => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
    { key: 'checkInTime', label: 'Check In', width: 100 },
    { key: 'checkOutTime', label: 'Check Out', width: 100 },
    { key: 'remarks', label: 'Remarks', width: 160 },
  ];

  if (!isAuthorized) {
    return (
      <div className="page-body">
        <PageHeader
          title={isSelfService ? 'My Attendance' : 'Attendance Application'}
          subtitle="Section 11 Restricted Access Module"
        />
        <Alert kind="error">
          🔒 <strong>Section 11 Restricted Access Policy Enforced:</strong> Tenant-wide records are restricted to Human Resources and explicitly audited support access. Members can only access their own check-in/out record.
        </Alert>
      </div>
    );
  }

  return (
    <div className="page-body">
      <ToastList toasts={toasts} onRemove={removeToast} />
      <PageHeader
        title={isSelfService && !isHRManager && !isJuniorHR && !isSupportReadOnly ? 'My Attendance' : 'Attendance Application'}
        subtitle={isHRManager
          ? 'HR Manager View — Tenant-wide attendance, editing and comment privileges'
          : isJuniorHR
            ? 'Junior HR View — Tenant-wide read and comment access'
            : isSelfService
              ? 'Record your own attendance. HR can review and manage tenant records.'
              : 'Audited support access — read only'}
      />

      {isSelfService && (
        <section style={{ padding: 16, background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', marginBottom: 'var(--sp-4)' }}>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginBottom: 8 }}>
            Today{today ? ` · ${new Date(`${today}T00:00:00`).toLocaleDateString()}` : ''}
          </div>
          {!todayRecord ? (
            <Button onClick={handleCheckIn} loading={clocking} disabled={loading || !!error}>Check In</Button>
          ) : todayRecord.checkInTime && !todayRecord.checkOutTime ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>Checked in at <strong>{todayRecord.checkInTime}</strong></span>
              <Button variant="secondary" onClick={handleCheckOut} loading={clocking} disabled={loading || !!error}>Check Out</Button>
            </div>
          ) : todayRecord.checkOutTime ? (
            <span>Attendance completed — {todayRecord.checkInTime} to {todayRecord.checkOutTime}</span>
          ) : (
            <span>Today’s attendance has already been recorded. Contact HR if it needs correction.</span>
          )}
        </section>
      )}

      {isJuniorHR && (
        <div style={{ padding: '10px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', marginBottom: 'var(--sp-4)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          ℹ️ <strong>Junior HR Privileges (Section 11 Matrix):</strong> You have tenant-wide view access and comment privileges. Modifying attendance statuses or check-in/out times is restricted to the HR Manager.
        </div>
      )}

      {isHRManager && (
        <div style={{ padding: '10px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', marginBottom: 'var(--sp-4)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          ✓ <strong>HR Manager Authority (Section 11 Matrix):</strong> You have full write authority over attendance statuses, timestamps, and HR comments.
        </div>
      )}

      <DataTable
        columns={columns}
        data={records}
        loading={loading}
        error={error ?? undefined}
        onRetry={load}
        searchKeys={['memberName', 'department', 'status', 'attendanceId']}
        emptyTitle="No attendance records"
        emptySubtitle="Records will appear here once generated"
        onRowClick={openRecord}
      />

      {/* Detail / edit drawer */}
      <Drawer
        open={!!selected}
        title={`Attendance Record — ${selected?.memberName ?? ''}`}
        onClose={() => setSelected(null)}
        onSave={isHRManager ? handleSave : undefined}
        saving={saving}
        saveLabel="Save Changes"
        width={520}
      >
        {selected && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)', padding: '10px 12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius)', fontSize: 'var(--font-size-sm)' }}>
              <div><span style={{ color: 'var(--color-text-muted)' }}>Date:</span> <strong>{new Date(selected.date).toLocaleDateString()}</strong></div>
              <div><span style={{ color: 'var(--color-text-muted)' }}>Department:</span> <strong>{selected.department}</strong></div>
              <div><span style={{ color: 'var(--color-text-muted)' }}>Attendance ID:</span> <strong>{selected.attendanceId || selected.id}</strong></div>
              <div><span style={{ color: 'var(--color-text-muted)' }}>Permissions:</span> <Badge variant={isHRManager ? 'success' : 'warning'}>{isHRManager ? 'Can Edit' : 'Read Only'}</Badge></div>
            </div>

            <FormField label="Status" hint={!isHRManager ? "Read-only for Junior HR" : undefined}>
              <SelectInput
                value={editStatus}
                onChange={e => setEditStatus(e.target.value)}
                disabled={!isHRManager}
              >
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </SelectInput>
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
              <FormField label="Check In Time" hint={!isHRManager ? "Read-only" : undefined}>
                <TextInput
                  type="text"
                  placeholder="09:00 AM"
                  value={checkIn}
                  onChange={e => setCheckIn(e.target.value)}
                  disabled={!isHRManager}
                />
              </FormField>
              <FormField label="Check Out Time" hint={!isHRManager ? "Read-only" : undefined}>
                <TextInput
                  type="text"
                  placeholder="06:00 PM"
                  value={checkOut}
                  onChange={e => setCheckOut(e.target.value)}
                  disabled={!isHRManager}
                />
              </FormField>
            </div>

            {canComment && <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--sp-4)', marginTop: 'var(--sp-4)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-subtle)', marginBottom: 'var(--sp-3)' }}>
                Authenticated HR Comments Thread (Section 11)
              </div>
              {(selected.hrComments ?? []).length === 0 ? (
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--sp-3)', fontStyle: 'italic' }}>
                  No comments recorded yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 'var(--sp-3)' }}>
                  {(selected.hrComments ?? []).map((c: any) => (
                    <div key={c.id || Math.random()} style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius)', padding: '8px 10px', fontSize: 'var(--font-size-sm)' }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: 2 }}>{c.author ?? c.authorId}</div>
                      <div style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{c.text}</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-subtle)', marginTop: 4 }}>
                        {new Date(c.timestamp).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {canComment && (
                <>
                  <FormField label="Append HR Comment">
                    <TextareaInput
                      placeholder="Add an authenticated comment or compliance note…"
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      style={{ minHeight: 64 }}
                    />
                  </FormField>
                  <Button
                    variant="secondary"
                    onClick={handleComment}
                    loading={commenting}
                    disabled={!comment.trim()}
                  >
                    Post Comment
                  </Button>
                </>
              )}
            </div>}
          </>
        )}
      </Drawer>
    </div>
  );
};
