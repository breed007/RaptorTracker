import React, { useEffect, useState } from 'react'
import { toast } from '../lib/toast'

const TARGETS = [
  { id: 'none', label: 'Off' },
  { id: 'folder', label: 'Folder' },
  { id: 'webdav', label: 'WebDAV' },
  { id: 's3', label: 'S3-compatible' },
]

function Field({ id, label, hint, ...props }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input-field" spellCheck={false} {...props} />
      {hint && <p className="text-xs text-raptor-muted mt-1">{hint}</p>}
    </div>
  )
}

const fmtWhen = (iso) => {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null
}

/** Settings → Backups: send each backup to a second place, so one dead disk doesn't take both. */
export default function OffsiteBackupCard() {
  const [cfg, setCfg] = useState(null)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/backup/offsite').then(r => (r.ok ? r.json() : null)).then(c => {
      if (!c) return
      setCfg(c); setDraft({ ...c, webdavPassword: '', s3SecretKey: '' })
    }).catch(() => {})
  }, [])

  if (!draft) return null
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }))

  const save = async () => {
    setError(''); setBusy('save')
    try {
      const res = await fetch('/api/backup/offsite', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'Could not save.'); return false }
      setCfg(body); setDraft({ ...body, webdavPassword: '', s3SecretKey: '' })
      return true
    } finally { setBusy(null) }
  }

  const run = async (kind) => {
    if (!(await save())) return
    setBusy(kind)
    try {
      const res = await fetch(`/api/backup/offsite/${kind}`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (kind === 'test') {
        if (res.ok) toast(`Connected. RaptorTracker can write there${body.existing ? ` and sees ${body.existing} earlier backup${body.existing === 1 ? '' : 's'}` : ''}.`, { tone: 'success' })
        else setError(body.error || 'The test failed.')
      } else {
        if (body.status) setCfg(body.status)
        if (res.ok) toast(`Sent ${body.name}.`, { tone: 'success' })
        else setError(body.error || 'Sending failed.')
      }
    } finally { setBusy(null) }
  }

  const last = cfg?.last
  const t = draft.target

  return (
    <div className="card p-5 space-y-4">
      <div className="section-title">Off-Box Copies</div>
      <p className="text-sm text-raptor-secondary">
        Backups on this server sit on the same disk as the database, so a failed SD card or drive loses both.
        Send a copy of each backup somewhere else as soon as it&apos;s taken.
      </p>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Destination">
        {TARGETS.map(x => (
          <button key={x.id} type="button" aria-pressed={t === x.id} onClick={() => set('target', x.id)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${t === x.id
              ? 'bg-raptor-accent text-white border-raptor-accent'
              : 'border-raptor-border text-raptor-secondary hover:text-raptor-primary'}`}>
            {x.label}
          </button>
        ))}
      </div>

      {t === 'folder' && (
        <Field id="offsite-folder" label="Folder on this server" value={draft.folder} onChange={e => set('folder', e.target.value)}
          placeholder="/mnt/nas/raptortracker"
          hint="A mounted NAS share or USB drive. In Docker, mount it into the container and use the path inside the container." />
      )}

      {t === 'webdav' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field id="offsite-webdav-url" label="Folder URL" value={draft.webdavUrl} onChange={e => set('webdavUrl', e.target.value)}
              placeholder="https://cloud.example.com/remote.php/dav/files/me/RaptorTracker"
              hint="Nextcloud, ownCloud, Synology, or any WebDAV server. The folder must already exist." />
          </div>
          <Field id="offsite-webdav-user" label="Username" value={draft.webdavUser} onChange={e => set('webdavUser', e.target.value)} autoComplete="off" />
          <Field id="offsite-webdav-pass" label="Password or app password" type="password" value={draft.webdavPassword}
            onChange={e => set('webdavPassword', e.target.value)} autoComplete="new-password"
            placeholder={cfg?.has_webdavPassword ? 'Saved — leave blank to keep' : ''} />
        </div>
      )}

      {t === 's3' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field id="offsite-s3-endpoint" label="Endpoint" value={draft.s3Endpoint} onChange={e => set('s3Endpoint', e.target.value)}
              placeholder="https://s3.us-west-002.backblazeb2.com"
              hint="AWS: https://s3.<region>.amazonaws.com · Backblaze B2, Cloudflare R2, Wasabi, and MinIO list theirs in the bucket settings." />
          </div>
          <Field id="offsite-s3-bucket" label="Bucket" value={draft.s3Bucket} onChange={e => set('s3Bucket', e.target.value)} />
          <Field id="offsite-s3-region" label="Region" value={draft.s3Region} onChange={e => set('s3Region', e.target.value)} placeholder="us-east-1 (R2 uses auto)" />
          <Field id="offsite-s3-prefix" label="Folder in the bucket (optional)" value={draft.s3Prefix} onChange={e => set('s3Prefix', e.target.value)} placeholder="raptortracker" />
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-raptor-secondary cursor-pointer select-none">
              <input type="checkbox" checked={draft.s3PathStyle} onChange={e => set('s3PathStyle', e.target.checked)} className="w-4 h-4 accent-raptor-accent" />
              Path-style URLs (MinIO and most non-AWS stores)
            </label>
          </div>
          <Field id="offsite-s3-key" label="Access key ID" value={draft.s3AccessKey} onChange={e => set('s3AccessKey', e.target.value)} autoComplete="off" />
          <Field id="offsite-s3-secret" label="Secret access key" type="password" value={draft.s3SecretKey}
            onChange={e => set('s3SecretKey', e.target.value)} autoComplete="new-password"
            placeholder={cfg?.has_s3SecretKey ? 'Saved — leave blank to keep' : ''} />
          <p className="sm:col-span-2 text-xs text-raptor-muted">
            Use a private bucket and a key that can only read and write that bucket. Backups include your records,
            uploaded documents, and the password hash.
          </p>
        </div>
      )}

      {t !== 'none' && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="offsite-keep">Keep newest</label>
            <input id="offsite-keep" type="number" min="1" max="365" value={draft.keep} onChange={e => set('keep', e.target.value)} className="input-field w-24" />
          </div>
          <button type="button" onClick={() => run('test')} disabled={!!busy} className="btn-secondary text-sm disabled:opacity-50">
            {busy === 'test' ? 'Testing…' : 'Test connection'}
          </button>
          <button type="button" onClick={() => run('push')} disabled={!!busy} className="btn-secondary text-sm disabled:opacity-50">
            {busy === 'push' ? 'Sending…' : 'Send latest backup now'}
          </button>
        </div>
      )}

      {error && <div className="text-sm text-red-500">{error}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={!!busy} className="btn-primary text-sm disabled:opacity-50">
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>
        {last?.at && cfg?.target !== 'none' && (
          <span className={`text-xs ${last.error ? 'text-red-500' : 'text-raptor-muted'}`}>
            Last copy {fmtWhen(last.at)}: {last.error ? `failed — ${last.error}` : last.name}
          </span>
        )}
      </div>
      {t !== 'none' && (
        <p className="text-xs text-raptor-muted">Copies go out after each nightly backup and each &ldquo;Back Up Now&rdquo;. Turn on nightly backups above.</p>
      )}
    </div>
  )
}
