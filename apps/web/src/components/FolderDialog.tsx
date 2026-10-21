import { FolderPlus, Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { Modal } from './Modal'
import { Spinner } from './Spinner'

interface FolderDialogProps {
  open: boolean
  mode: 'create' | 'rename'
  initialPath?: string
  busy: boolean
  onClose: () => void
  onSubmit: (path: string) => void
}

export function FolderDialog({
  open,
  mode,
  initialPath,
  busy,
  onClose,
  onSubmit,
}: FolderDialogProps) {
  const { t } = useI18n()
  const [path, setPath] = useState(initialPath ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the field whenever the dialog opens
  useEffect(() => {
    if (!open) return
    setPath(initialPath ?? '')
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [open])

  function submit() {
    const trimmed = path.trim()
    if (!trimmed || busy) return
    onSubmit(trimmed)
  }

  return (
    <Modal
      open={open}
      title={mode === 'create' ? t('folder.createTitle') : t('folder.renameTitle')}
      subtitle={mode === 'create' ? t('folder.createHint') : t('folder.renameHint')}
      onClose={busy ? () => undefined : onClose}
      footer={
        <div className="dialog-actions">
          <button type="button" className="button button--ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={submit}
            disabled={busy || !path.trim()}
          >
            {busy ? (
              <Spinner />
            ) : mode === 'create' ? (
              <FolderPlus size={15} />
            ) : (
              <Pencil size={15} />
            )}
            {mode === 'create' ? t('folder.create') : t('common.save')}
          </button>
        </div>
      }
    >
      <label className="field">
        <span className="field__label">{t('folder.path')}</span>
        <input
          ref={inputRef}
          className="input"
          value={path}
          onChange={(event) => setPath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
          }}
          placeholder={t('folder.pathPlaceholder')}
        />
      </label>
    </Modal>
  )
}
