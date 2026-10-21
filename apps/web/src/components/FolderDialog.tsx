import { FolderPlus, Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
      title={mode === 'create' ? '新建文件夹' : '重命名文件夹'}
      subtitle={
        mode === 'create'
          ? '文件夹会创建在当前账户下；层级请使用服务器的分隔符（通常是 / 或 .）'
          : '修改完整路径；已有邮件会跟随文件夹移动'
      }
      onClose={busy ? () => undefined : onClose}
      footer={
        <div className="dialog-actions">
          <button type="button" className="button button--ghost" onClick={onClose} disabled={busy}>
            取消
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
            {mode === 'create' ? '创建' : '保存'}
          </button>
        </div>
      }
    >
      <label className="field">
        <span className="field__label">文件夹路径</span>
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
          placeholder="例如：项目/2026"
        />
      </label>
    </Modal>
  )
}
