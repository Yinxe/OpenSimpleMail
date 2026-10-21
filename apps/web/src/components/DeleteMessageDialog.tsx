import { Trash2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'

interface DeleteMessageDialogProps {
  open: boolean
  subject: string
  sender: string
  /** Human-readable trash folder name, or null when the delete is permanent. */
  destinationLabel: string | null
  keepConfirm: boolean
  busy: boolean
  onKeepConfirmChange: (value: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteMessageDialog({
  open,
  subject,
  sender,
  destinationLabel,
  keepConfirm,
  busy,
  onKeepConfirmChange,
  onCancel,
  onConfirm,
}: DeleteMessageDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  return (
    <Modal
      open={open}
      title="删除这封邮件？"
      subtitle={
        destinationLabel ? `将移动到「${destinationLabel}」` : '这封邮件将被永久删除，无法恢复'
      }
      onClose={onCancel}
      footer={
        <div className="dialog-actions">
          <button
            type="button"
            ref={cancelRef}
            className="button button--ghost"
            onClick={onCancel}
            disabled={busy}
          >
            取消
          </button>
          <button
            type="button"
            className="button button--danger"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <Spinner /> : <Trash2 size={15} />}
            删除
          </button>
        </div>
      }
    >
      <div className="delete-summary">
        <span className="delete-summary__icon">
          <Trash2 size={20} />
        </span>
        <div className="delete-summary__text">
          <p className="delete-summary__subject">{subject.trim() || '(无主题)'}</p>
          <p className="delete-summary__from">{sender || '未知发件人'}</p>
        </div>
      </div>

      <p className="delete-note">
        {destinationLabel
          ? `邮件会保留在「${destinationLabel}」中，需要时可以再找回。`
          : '当前文件夹没有可用的废纸篓，删除后无法恢复。'}
      </p>

      <label className="check delete-remember">
        <input
          type="checkbox"
          checked={keepConfirm}
          onChange={(event) => onKeepConfirmChange(event.target.checked)}
        />
        <span>本会话内，后续删除也需要二次确认</span>
      </label>
      <p className="delete-hint">
        取消勾选后，后续删除会直接执行。此设置仅在当前会话生效，刷新页面或在设置中可恢复。
      </p>
    </Modal>
  )
}
