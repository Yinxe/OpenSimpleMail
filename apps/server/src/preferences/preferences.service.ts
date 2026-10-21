import { Injectable } from '@nestjs/common'
import { DEFAULT_PREFERENCES, type UserPreferencesDto } from '@osm/shared'
import { DatabaseService } from '../core/database.service'
import type { UpdatePreferencesDto } from './preferences.dto'

interface PreferencesRow {
  refresh_seconds: number
  page_size: number
  auto_mark_read: number
  load_remote_images: number
  desktop_notifications: number
  default_view: 'account' | 'unified'
  density: 'comfortable' | 'compact'
}

@Injectable()
export class PreferencesService {
  constructor(private readonly db: DatabaseService) {}

  get(userId: string): UserPreferencesDto {
    const row = this.db.db
      .prepare(
        `SELECT refresh_seconds, page_size, auto_mark_read, load_remote_images,
                desktop_notifications, default_view, density
         FROM user_preferences WHERE user_id = ?`,
      )
      .get(userId) as PreferencesRow | undefined

    if (!row) return { ...DEFAULT_PREFERENCES }

    return {
      refreshSeconds: row.refresh_seconds,
      pageSize: row.page_size,
      autoMarkRead: row.auto_mark_read === 1,
      loadRemoteImages: row.load_remote_images === 1,
      desktopNotifications: row.desktop_notifications === 1,
      defaultView: row.default_view,
      density: row.density,
    }
  }

  update(userId: string, dto: UpdatePreferencesDto): UserPreferencesDto {
    const current = this.get(userId)
    const next: UserPreferencesDto = {
      ...current,
      ...dto,
    }
    const now = new Date().toISOString()

    this.db.db
      .prepare(
        `INSERT INTO user_preferences (
          user_id, refresh_seconds, page_size, auto_mark_read, load_remote_images,
          desktop_notifications, default_view, density, updated_at
        ) VALUES (
          @userId, @refreshSeconds, @pageSize, @autoMarkRead, @loadRemoteImages,
          @desktopNotifications, @defaultView, @density, @now
        )
        ON CONFLICT(user_id) DO UPDATE SET
          refresh_seconds = excluded.refresh_seconds,
          page_size = excluded.page_size,
          auto_mark_read = excluded.auto_mark_read,
          load_remote_images = excluded.load_remote_images,
          desktop_notifications = excluded.desktop_notifications,
          default_view = excluded.default_view,
          density = excluded.density,
          updated_at = excluded.updated_at`,
      )
      .run({
        userId,
        refreshSeconds: next.refreshSeconds,
        pageSize: next.pageSize,
        autoMarkRead: next.autoMarkRead ? 1 : 0,
        loadRemoteImages: next.loadRemoteImages ? 1 : 0,
        desktopNotifications: next.desktopNotifications ? 1 : 0,
        defaultView: next.defaultView,
        density: next.density,
        now,
      })

    return next
  }
}
