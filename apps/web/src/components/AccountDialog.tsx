import type { AccountDto, ServerSettingsDto } from '@osm/shared'
import { Check, Server, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, errorMessage } from '@/lib/api'
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
    hint: 'Gmail 需要开启两步验证，并使用「应用专用密码」登录。',
  },
  {
    id: 'outlook',
    label: 'Outlook',
    domain: 'outlook.com',
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
    hint: 'Microsoft 账户通常需要应用密码，且租户管理员需允许 IMAP/SMTP。',
  },
  {
    id: 'qq',
    label: 'QQ 邮箱',
    domain: 'qq.com',
    imap: { host: 'imap.qq.com', port: 993, secure: true },
    smtp: { host: 'smtp.qq.com', port: 465, secure: true },
    hint: '在 QQ 邮箱设置中开启 IMAP/SMTP 服务，并生成授权码作为密码。',
  },
  {
    id: '163',
    label: '网易 163',
    domain: '163.com',
    imap: { host: 'imap.163.com', port: 993, secure: true },
    smtp: { host: 'smtp.163.com', port: 465, secure: true },
    hint: '开启 IMAP/SMTP 后使用客户端授权密码，而不是登录密码。',
  },
  {
    id: '126',
    label: '网易 126',
    domain: '126.com',
    imap: { host: 'imap.126.com', port: 993, secure: true },
    smtp: { host: 'smtp.126.com', port: 465, secure: true },
    hint: '开启 IMAP/SMTP 后使用客户端授权密码。',
  },
  {
    id: 'icloud',
    label: 'iCloud',
    domain: 'icloud.com',
    imap: { host: 'imap.mail.me.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: false },
    hint: 'iCloud 需要在 Apple ID 安全设置中生成 App 专用密码。',
  },
  {
    id: 'yahoo',
    label: 'Yahoo',
    domain: 'yahoo.com',
    imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
    hint: 'Yahoo 需要生成第三方应用密码。',
  },
  {
    id: 'custom',
    label: '自定义 / 自建',
    domain: '',
    imap: { host: '', port: 993, secure: true },
    smtp: { host: '', port: 465, secure: true },
    hint: '填写你的邮件服务商或自建服务器的 IMAP / SMTP 参数。',
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
    verify: true,
  }
}

export function AccountDialog({ open, account, onClose, onSaved }: AccountDialogProps) {
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
      setError('请填写账户名称、邮箱地址和登录用户名')
      return
    }
    if (!editing && !form.password.trim()) {
      setError('请填写邮箱密码或应用专用密码')
      return
    }
    if (!form.imap.host.trim() || !form.smtp.host.trim()) {
      setError('请填写 IMAP 和 SMTP 服务器地址')
      return
    }
    if (!Number.isInteger(imapPort) || imapPort < 1 || imapPort > 65535) {
      setError('IMAP 端口无效')
      return
    }
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      setError('SMTP 端口无效')
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
      ...(editing ? {} : { skipTest: !form.verify }),
    }

    setBusy(true)
    try {
      const saved = editing
        ? await api.patch<AccountDto>(`/accounts/${account?.id}`, payload)
        : await api.post<AccountDto>('/accounts', payload)
      toast.success(editing ? '邮箱设置已更新' : '邮箱已添加', saved.email)
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
      title={editing ? '编辑邮箱账户' : '添加邮箱账户'}
      subtitle="使用标准 IMAP / SMTP 协议连接，兼容绝大多数邮箱服务商"
      size="lg"
      onClose={busy ? () => undefined : onClose}
      footer={
        <div className="dialog-foot">
          <span className="dialog-foot__note">
            <ShieldCheck size={14} /> 凭据以 AES-256-GCM 加密后存储
          </span>
          <div className="dialog-foot__actions">
            <button
              type="button"
              className="button button--ghost"
              onClick={onClose}
              disabled={busy}
            >
              取消
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={submit}
              disabled={busy}
            >
              {busy ? <Spinner /> : <Check size={16} />}
              {editing ? '保存修改' : form.verify ? '验证并保存' : '直接保存'}
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
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        {activePreset?.hint ? <p className="account-form__hint">{activePreset.hint}</p> : null}

        <div className="form-grid">
          <label className="field">
            <span className="field__label">账户名称</span>
            <input
              className="input"
              value={form.name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="工作邮箱 / 个人邮箱"
            />
          </label>
          <label className="field">
            <span className="field__label">邮箱地址</span>
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
            <span className="field__label">登录用户名</span>
            <input
              className="input"
              value={form.username}
              onChange={(event) => patch({ username: event.target.value })}
              placeholder="通常是完整邮箱地址"
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span className="field__label">密码 / 应用专用密码</span>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(event) => patch({ password: event.target.value })}
              placeholder={editing ? '留空表示不修改' : '邮箱密码或授权码'}
              autoComplete="new-password"
            />
          </label>
        </div>

        <div className="server-block">
          <div className="server-block__head">
            <Server size={15} />
            <span>IMAP 收件服务器</span>
          </div>
          <div className="server-grid">
            <label className="field field--wide">
              <span className="field__label">主机名</span>
              <input
                className="input"
                value={form.imap.host}
                onChange={(event) => patch({ imap: { ...form.imap, host: event.target.value } })}
                placeholder="imap.example.com"
              />
            </label>
            <label className="field field--port">
              <span className="field__label">端口</span>
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
            <span>SMTP 发件服务器</span>
          </div>
          <div className="server-grid">
            <label className="field field--wide">
              <span className="field__label">主机名</span>
              <input
                className="input"
                value={form.smtp.host}
                onChange={(event) => patch({ smtp: { ...form.smtp, host: event.target.value } })}
                placeholder="smtp.example.com"
              />
            </label>
            <label className="field field--port">
              <span className="field__label">端口</span>
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

        <div className="account-form__footer-row">
          <div className="color-picker">
            <span className="field__label">标识颜色</span>
            <div className="color-picker__swatches">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`color-dot ${form.color === color ? 'is-active' : ''}`}
                  style={{ background: color }}
                  onClick={() => patch({ color })}
                  aria-label={`选择颜色 ${color}`}
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
              <span>保存前验证 IMAP / SMTP 连接</span>
            </label>
          ) : null}
        </div>

        {error ? <p className="form__error">{error}</p> : null}
      </div>
    </Modal>
  )
}
