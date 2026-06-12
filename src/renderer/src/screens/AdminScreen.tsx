import React from 'react'
import { useAdminStats } from '../hooks/useAdminStats'
import { useLocale } from '../hooks/useLocale'

interface Props {
  onBack: () => void
}

export default function AdminScreen({ onBack }: Props) {
  const { stats, loading, refresh } = useAdminStats(true)
  const { t, dateLocale } = useLocale()

  function fmtDate(ms: number) {
    if (!ms) return '—'
    return new Date(ms).toLocaleString(dateLocale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <button type="button" className="btn-secondary" onClick={onBack}>← {t('common_back')}</button>
        <h1>{t('admin_title')}</h1>
        <button type="button" className="btn-secondary" onClick={refresh} disabled={loading}>
          {loading ? t('admin_refreshing') : `↻ ${t('common_refresh')}`}
        </button>
      </header>

      {stats.error && <div className="admin-error">{stats.error}</div>}

      <section className="admin-stats-grid">
        <StatCard label={t('admin_stat_users')} value={stats.totalUsers} />
        <StatCard label={t('admin_stat_online')} value={stats.activeUsers} hint={t('admin_stat_online_hint')} />
        <StatCard label={t('admin_stat_rooms')} value={stats.totalRooms} />
        <StatCard label={t('admin_stat_active_rooms')} value={stats.activeRooms} />
        <StatCard label={t('admin_stat_sharing')} value={stats.sharingCount} />
        <StatCard label={t('admin_stat_dm')} value={stats.dmCount} />
        <StatCard label={t('admin_stat_reports')} value={stats.reportCount < 0 ? '—' : stats.reportCount} />
        <StatCard label={t('admin_stat_rtdb')} value={stats.rtdbNodes} />
      </section>

      <p className="admin-meta">{t('admin_last_update', stats.lastRefresh || '—')}</p>

      <section className="admin-section">
        <h2>{t('admin_users_section', stats.users.length)}</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin_col_name')}</th>
                <th>{t('admin_col_email')}</th>
                <th>{t('admin_col_friends')}</th>
                <th>{t('admin_col_last_active')}</th>
                <th>{t('admin_col_status')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.users.map((u) => (
                <tr key={u.uid}>
                  <td>{u.displayName}</td>
                  <td>{u.email}</td>
                  <td>{u.friendCount}</td>
                  <td>{fmtDate(u.lastActive)}</td>
                  <td>
                    <span className={`admin-pill ${u.online ? 'online' : ''}`}>
                      {u.online ? t('common_online') : t('admin_status_offline')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <h2>{t('admin_rooms_section', stats.rooms.length)}</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin_col_room')}</th>
                <th>{t('admin_col_active')}</th>
                <th>{t('admin_col_members')}</th>
                <th>{t('admin_col_voice')}</th>
                <th>{t('admin_col_video')}</th>
                <th>{t('admin_col_share')}</th>
                <th>{t('admin_col_created')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.rooms.map((r) => (
                <tr key={r.id} className={r.activeUsers > 0 ? 'row-active' : ''}>
                  <td>
                    <div className="admin-room-title">{r.title}</div>
                    <div className="admin-room-id">{r.id}</div>
                  </td>
                  <td>{r.activeUsers}</td>
                  <td>{r.memberCount}</td>
                  <td>{r.voiceCount || '—'}</td>
                  <td>{r.hasVideo ? '✓' : '—'}</td>
                  <td>{r.isSharing ? '📺' : '—'}</td>
                  <td>{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section admin-quota">
        <h2>{t('admin_quota_title')}</h2>
        <ul>
          <li>{t('admin_quota_firestore_read')}</li>
          <li>{t('admin_quota_firestore_write')}</li>
          <li>{t('admin_quota_rtdb')}</li>
          <li>{t('admin_quota_screen')}</li>
        </ul>
      </section>
    </div>
  )
}

function StatCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-value">{value}</div>
      <div className="admin-stat-label">{label}</div>
      {hint && <div className="admin-stat-hint">{hint}</div>}
    </div>
  )
}
