import type { ContactDto } from '@osm/shared'
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

interface RecipientInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

function currentToken(value: string): string {
  const match = value.match(/(?:^|[,;])\s*([^,;]*)$/)
  return (match?.[1] ?? '').trim()
}

function formatContact(contact: ContactDto): string {
  const name = contact.name.trim()
  if (!name) return contact.email
  const safeName = /[",;]/.test(name) ? `"${name.replace(/"/g, '\\"')}"` : name
  return `${safeName} <${contact.email}>`
}

function replaceToken(value: string, contact: ContactDto): string {
  const match = value.match(/^(.*[,;]\s*)?([^,;]*)$/)
  const prefix = match?.[1] ?? ''
  return `${prefix}${formatContact(contact)}, `
}

/**
 * Recipient field with contact suggestions. Suggestions are scoped to the token
 * after the last comma/semicolon, so editing the second recipient does not
 * suggest based on the first one.
 */
export function RecipientInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
}: RecipientInputProps) {
  const [suggestions, setSuggestions] = useState<ContactDto[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const requestRef = useRef(0)
  const blurTimer = useRef<number | null>(null)

  useEffect(() => {
    const token = currentToken(value)
    if (!token) {
      setSuggestions([])
      setOpen(false)
      setActive(-1)
      return
    }

    const requestId = requestRef.current + 1
    requestRef.current = requestId
    const timer = window.setTimeout(async () => {
      try {
        const list = await api.get<ContactDto[]>(`/contacts?q=${encodeURIComponent(token)}`)
        if (requestId !== requestRef.current) return
        setSuggestions(list)
        setOpen(list.length > 0)
        setActive(list.length > 0 ? 0 : -1)
      } catch {
        if (requestId === requestRef.current) {
          setSuggestions([])
          setOpen(false)
          setActive(-1)
        }
      }
    }, 180)

    return () => window.clearTimeout(timer)
  }, [value])

  useEffect(() => {
    return () => {
      if (blurTimer.current) window.clearTimeout(blurTimer.current)
    }
  }, [])

  function choose(contact: ContactDto) {
    onChange(replaceToken(value, contact))
    setOpen(false)
    setSuggestions([])
    setActive(-1)
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => (index + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => (index - 1 + suggestions.length) % suggestions.length)
    } else if (event.key === 'Enter') {
      const contact = suggestions[active]
      if (!contact) return
      event.preventDefault()
      choose(contact)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="recipient-input">
      <input
        id={id}
        className="composer__input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true)
        }}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 120)
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      {open ? (
        <div className="recipient-suggest">
          {suggestions.map((contact, index) => (
            <button
              key={contact.email}
              type="button"
              className={index === active ? 'is-active' : undefined}
              onMouseDown={(event) => {
                event.preventDefault()
                choose(contact)
              }}
              onMouseEnter={() => setActive(index)}
            >
              <span className="recipient-suggest__name">{contact.name || contact.email}</span>
              {contact.name ? (
                <span className="recipient-suggest__email">{contact.email}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
