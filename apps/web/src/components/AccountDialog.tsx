import type { AccountDto, ServerSettingsDto } from '@osm/shared'
import { Check, Server, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, errorMessage } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import type { MessageKey } from '@/lib/locales'
import { useToast } from '@/lib/toast'
import { Modal } from './Modal'
import { Spinner } from './Spinner'

interface AccountDialogProps {
  open: boolean
  account?: AccountDto | null
  onClose: () => void
  onSaved: (account: AccountDto) => void
}

interface Preset {
  id: string
  label: string
  labelKey?: MessageKey
  hintKey?: MessageKey
  domain: string
  imap: ServerSettingsDto
  smtp: ServerSettingsDto
  hint?: string
}

const PRESETS: Preset[] = [
  {
    id: 'gmail',
    label: 'Gmail',
    domain: 'gmail.com',
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
    hintKey: 'account.gmailHint',
  },
  {
    id: 'outlook',
    label: 'Outlook',
    domain: 'outlook.com',
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
    hintKey: 'account.outlookHint',
  },
  {
    id: 'qq',
    label: 'QQ Mail',
    labelKey: 'account.qqLabel',
    domain: 'qq.com',
    imap: { host: 'imap.qq.com', port: 993, secure: true },
    smtp: { host: 'smtp.qq.com', port: 465, secure: true },
    hintKey: 'account.qqHint',
  },
  {
    id: '163',
    label: 'NetEase 163',
    labelKey: 'account.163Label',
    domain: '163.com',
    imap: { host: 'imap.163.com', port: 993, secure: true },
    smtp: { host: 'smtp.163.com', port: 465, secure: true },
    hintKey: 'account.163Hint',
  },
  {
    id: '126',
    label: 'NetEase 126',
    labelKey: 'account.126Label',
    domain: '126.com',
    imap: { host: 'imap.126.com', port: 993, secure: true },
    smtp: { host: 'smtp.126.com', port: 465, secure: true },
    hintKey: 'account.126Hint',
  },
  {
    id: 'icloud',
    label: 'iCloud',
    domain: 'icloud.com',
    imap: { host: 'imap.mail.me.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: false },
    hintKey: 'account.icloudHint',
  },
  {
    id: 'yahoo',
    label: 'Yahoo',
    domain: 'yahoo.com',
    imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
    hintKey: 'account.yahooHint',
  },
  {
    id: 'custom',
    label: 'Custom',
    labelKey: 'account.customLabel',
    domain: '',
    imap: { host: '', port: 993, secure: true },
    smtp: { host: '', port: 465, secure: true },
    hintKey: 'account.customHint',
  },
]

const COLORS = ['#0f766e', '#b45309', '#4338ca', '#be123c', '#0369a1', '#4d7c0f', '#7e22ce']

interface FormState {
  name: string
  email: string
  username: string
  password: string
  imap: ServerSettingsDto & { portText: string }
  smtp: ServerSettingsDto & { portText: string }
  color: string
  signature: string
  verify: boolean
}

function initialState(account?: AccountDto | null): FormState {
  return {
    name: account?.name ?? '',
    email: account?.email ?? '',
    username: account?.username ?? '',
    password: '',
    imap: {
      host: account?.imap.host ?? '',
      port: account?.imap.port ?? 993,
      secure: account?.imap.secure ?? true,
      portText: String(account?.imap.port ?? 993),
    },
    smtp: {
      host: account?.smtp.host ?? '',
      port: account?.smtp.port ?? 465,
      secure: account?.smtp.secure ?? true,
      portText: String(account?.smtp.port ?? 465),
    },
    color: account?.color ?? (COLORS[0] as string),
    signature: account?.signature ?? '',
    verify: true,
  }
}

export function AccountDialog({ open, account, onClose, onSaved }: AccountDialogProps) {
  const { t } = useI18n()
  const toast = useToast()
  const [form, setForm] = useState<FormState>(() => initialState(account))
  const [preset, setPreset] = useState('custom')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const editing = Boolean(account)

  useEffect(() => {
    if (!open) return
    setForm(initialState(account))
    setError('')
    setBusy(false)
    if (account) {
      const found = PRESETS.find((item) => item.imap.host === account.imap.host)
      setPreset(found?.id ?? 'custom')
    } else {
      setPreset('custom')
    }
  }, [open, account])

  function patch(next: Partial<FormState>) {
    setForm((current) => ({ ...current, ...next }))
  }

  function applyPreset(item: Preset) {
    setPreset(item.id)
    setForm((current) => ({
      ...current,
      imap: { ...item.imap, portText: String(item.imap.port) },
      smtp: { ...item.smtp, portText: String(item.smtp.port) },
      name: current.name || (item.id === 'custom' ? '' : item.label),
    }))
  }

  async function submit() {
    setError('')
    const imapPort = Number.parseInt(form.imap.portText, 10)
    const smtpPort = Number.parseInt(form.smtp.portText, 10)
    if (!form.name.trim() || !form.email.trim() || !form.username.trim()) {
      setError(t('account.needBasics'))
      return
    }
    if (!editing && !form.password.trim()) {
      setError(t('account.needPassword'))
      return
    }
    if (!form.imap.host.trim() || !form.smtp.host.trim()) {
      setError(t('account.needServers'))
      return
    }
    if (!Number.isInteger(imapPort) || imapPort < 1 || imapPort > 65535) {
      setError(t('account.badImapPort'))
      return
    }
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      setError(t('account.badSmtpPort'))
      return
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      username: form.username.trim(),
      ...(form.password.trim() ? { password: form.password } : {}),
      imap: { host: form.imap.host.trim(), port: imapPort, secure: form.imap.secure },
      smtp: { host: form.smtp.host.trim(), port: smtpPort, secure: form.smtp.secure },
      color: form.color,
      signature: form.signature.trim(),
      ...(editing ? {} : { skipTest: !form.verify }),
    }

    setBusy(true)
    try {
      const saved = editing
        ? await api.patch<AccountDto>(`/accounts/${account?.id}`, payload)
        : await api.post<AccountDto>('/accounts', payload)
      toast.success(editing ? t('account.updated') : t('account.added'), saved.email)
      onSaved(saved)
      onClose()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const activePreset = PRESETS.find((item) => item.id === preset)

  return (
    <Modal
      open={open}
      title={editing ? t('account.editTitle') : t('account.addTitle')}
      subtitle={t('account.subtitle')}
      size="lg"
      onClose={busy ? () => undefined : onClose}
      footer={
        <div className="dialog-foot">
          <span className="dialog-foot__note">
            <ShieldCheck size={14} /> {t('account.encrypted')}
          </span>
          <div className="dialog-foot__actions">
            <button
              type="button"
              className="button button--ghost"
              onClick={onClose}
              disabled={busy}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={submit}
              disabled={busy}
            >
              {busy ? <Spinner /> : <Check size={16} />}
              {editing
                ? t('account.saveChanges')
                : form.verify
                  ? t('account.verifyAndSave')
                  : t('account.saveDirectly')}
            </button>
          </div>
        </div>
      }
    >
      <div className="account-form">
        {!editing ? (
          <div className="preset-grid">
            {PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`preset ${preset === item.id ? 'is-active' : ''}`}
                onClick={() => applyPreset(item)}
              >
                {item.labelKey ? t(item.labelKey) : item.label}
              </button>
            ))}
          </div>
        ) : null}

        {activePreset?.hintKey ? (
          <p className="account-form__hint">{t(activePreset.hintKey)}</p>
        ) : null}

        <div className="form-grid">
          <label className="field">
            <span className="field__label">{t('account.name')}</span>
            <input
              className="input"
              value={form.name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder={t('account.namePlaceholder')}
            />
          </label>
          <label className="field">
            <span className="field__label">{t('account.email')}</span>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(event) => patch({ email: event.target.value })}
              onBlur={() => {
                if (!form.username) patch({ username: form.email })
                if (!form.name && form.email.includes('@')) {
                  patch({ name: form.email.split('@')[0] ?? '' })
                }
              }}
              placeholder="you@example.com"
              disabled={editing}
            />
          </label>
          <label className="field">
            <span className="field__label">{t('account.username')}</span>
            <input
              className="input"
              value={form.username}
              onChange={(event) => patch({ username: event.target.value })}
              placeholder={t('account.usernamePlaceholder')}
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span className="field__label">{t('account.password')}</span>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(event) => patch({ password: event.target.value })}
              placeholder={editing ? t('account.passwordKeep') : t('account.passwordPlaceholder')}
              autoComplete="new-password"
            />
          </label>
        </div>

        <div className="server-block">
          <div className="server-block__head">
            <Server size={15} />
            <span>{t('account.imapServer')}</span>
          </div>
          <div className="server-grid">
            <label className="field field--wide">
              <span className="field__label">{t('account.host')}</span>
              <input
                className="input"
                value={form.imap.host}
                onChange={(event) => patch({ imap: { ...form.imap, host: event.target.value } })}
                placeholder="imap.example.com"
              />
            </label>
            <label className="field field--port">
              <span className="field__label">{t('account.port')}</span>
              <input
                className="input"
                value={form.imap.portText}
                onChange={(event) =>
                  patch({ imap: { ...form.imap, portText: event.target.value } })
                }
                inputMode="numeric"
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.imap.secure}
                onChange={(event) =>
                  patch({ imap: { ...form.imap, secure: event.target.checked } })
                }
              />
              <span>SSL / TLS</span>
            </label>
          </div>
        </div>

        <div className="server-block">
          <div className="server-block__head">
            <Server size={15} />
            <span>{t('account.smtpServer')}</span>
          </div>
          <div className="server-grid">
            <label className="field field--wide">
              <span className="field__label">{t('account.host')}</span>
              <input
                className="input"
                value={form.smtp.host}
                onChange={(event) => patch({ smtp: { ...form.smtp, host: event.target.value } })}
                placeholder="smtp.example.com"
              />
            </label>
            <label className="field field--port">
              <span className="field__label">{t('account.port')}</span>
              <input
                className="input"
                value={form.smtp.portText}
                onChange={(event) =>
                  patch({ smtp: { ...form.smtp, portText: event.target.value } })
                }
                inputMode="numeric"
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.smtp.secure}
                onChange={(event) =>
                  patch({ smtp: { ...form.smtp, secure: event.target.checked } })
                }
              />
              <span>SSL / TLS</span>
            </label>
          </div>
        </div>

        <label className="field field--wide">
          <span className="field__label">{t('account.signature')}</span>
          <textarea
            className="input"
            rows={3}
            maxLength={2000}
            value={form.signature}
            onChange={(event) => patch({ signature: event.target.value })}
            placeholder={t('account.signaturePlaceholder')}
          />
        </label>

        <div className="account-form__footer-row">
          <div className="color-picker">
            <span className="field__label">{t('account.color')}</span>
            <div className="color-picker__swatches">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`color-dot ${form.color === color ? 'is-active' : ''}`}
                  style={{ background: color }}
                  onClick={() => patch({ color })}
                  aria-label={t('account.chooseColor', { color })}
                />
              ))}
            </div>
          </div>
          {!editing ? (
            <label className="check check--verify">
              <input
                type="checkbox"
                checked={form.verify}
                onChange={(event) => patch({ verify: event.target.checked })}
              />
              <span>{t('account.verifyBeforeSave')}</span>
            </label>
          ) : null}
        </div>

        {error ? <p className="form__error">{error}</p> : null}
      </div>
    </Modal>
  )
}
