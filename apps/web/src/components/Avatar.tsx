import { avatarColor, initials } from '@/lib/format'

interface AvatarProps {
  name: string
  seed?: string
  size?: 'sm' | 'md' | 'lg'
  color?: string
}

export function Avatar({ name, seed, size = 'md', color }: AvatarProps) {
  const background = color ?? avatarColor(seed ?? name)
  return (
    <span
      className={`avatar avatar--${size}`}
      style={{ background }}
      aria-hidden="true"
      title={name}
    >
      {initials(name)}
    </span>
  )
}
