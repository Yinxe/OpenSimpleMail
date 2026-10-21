import { Trash2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n'
import { Modal } from './Modal'
import { Spinner } from './Spinner'

interface DeleteMessageDialogProps {
  open: boolean
  subject: string
  sender: string
  /** Human-readable trash folder name, or null when the delete is permanent. */
  destinationLabel: string | null
  /** False while the folder list is still loading, so the copy stays neutral. */
  destinationKnown: boolean
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
  destinationKnown,
  keepConfirm,
  busy,
  onKeepConfirmChange,
  onCancel,
  onConfirm,
}: DeleteMessageDialogProps) {
  const { t } = useI18n()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  const subtitle = !destinationKnown
    ? t('delete.removesFromList')
    : destinationLabel
      ? t('delete.movesTo', { folder: destinationLabel })
      : t('delete.permanent')

  return (
    <Modal
      open={open}
      title={t('delete.title')}
      subtitle={subtitle}
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
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="button button--danger"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <Spinner /> : <Trash2 size={15} />}
            {t('delete.confirm')}
          </button>
        </div>
      }
    >
      <div className="delete-summary">
        <span className="delete-summary__icon">
          <Trash2 size={20} />
        </span>
        <div className="delete-summary__text">
          <p className="delete-summary__subject">{subject.trim() || t('delete.noSubject')}</p>
          <p className="delete-summary__from">{sender || t('delete.unknownSender')}</p>
        </div>
      </div>

      <p className="delete-note">
        {!destinationKnown
          ? t('delete.recoverHint')
          : destinationLabel
            ? t('delete.keepHint', { folder: destinationLabel })
            : t('delete.noTrashHint')}
      </p>

      <label className="check delete-remember">
        <input
          type="checkbox"
          checked={keepConfirm}
          onChange={(event) => onKeepConfirmChange(event.target.checked)}
        />
        <span>{t('delete.askAgain')}</span>
      </label>
      <p className="delete-hint">{t('delete.askAgainHint')}</p>
    </Modal>
  )
}
