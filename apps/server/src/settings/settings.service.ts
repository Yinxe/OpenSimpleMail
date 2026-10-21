import { Injectable } from '@nestjs/common'
import type { SystemSettingsDto } from '@osm/shared'
import { DatabaseService } from '../core/database.service'

interface SettingsRow {
  site_name: string
  allow_registration: number
  demo_enabled: number
  setup_completed_at: string | null
}

export interface CompleteSetupInput {
  siteName: string
  allowRegistration: boolean
  demoEnabled: boolean
}

export interface UpdateSettingsInput {
  siteName?: string
  allowRegistration?: boolean
  demoEnabled?: boolean
}

@Injectable()
export class SettingsService {
  constructor(private readonly db: DatabaseService) {}

  get(): SystemSettingsDto {
    const row = this.db.db
      .prepare(
        `SELECT site_name, allow_registration, demo_enabled, setup_completed_at
         FROM app_settings WHERE id = 1`,
      )
      .get() as SettingsRow | undefined

    if (!row) {
      // Should be created by DatabaseService.migrate(), but keep this defensive
      // so a manually edited database cannot crash every request.
      return {
        initialized: false,
        siteName: 'OpenSimpleMail',
        allowRegistration: false,
        demoEnabled: false,
      }
    }

    return {
      initialized: Boolean(row.setup_completed_at),
      siteName: row.site_name,
      allowRegistration: row.allow_registration === 1,
      demoEnabled: row.demo_enabled === 1,
    }
  }

  isInitialized(): boolean {
    return this.get().initialized
  }

  completeSetup(input: CompleteSetupInput): SystemSettingsDto {
    const now = new Date().toISOString()
    this.db.db
      .prepare(
        `UPDATE app_settings SET
          site_name = @siteName,
          allow_registration = @allowRegistration,
          demo_enabled = @demoEnabled,
          setup_completed_at = @now,
          updated_at = @now
         WHERE id = 1`,
      )
      .run({
        siteName: input.siteName.trim(),
        allowRegistration: input.allowRegistration ? 1 : 0,
        demoEnabled: input.demoEnabled ? 1 : 0,
        now,
      })
    return this.get()
  }

  update(input: UpdateSettingsInput): SystemSettingsDto {
    const current = this.get()
    const now = new Date().toISOString()
    this.db.db
      .prepare(
        `UPDATE app_settings SET
          site_name = @siteName,
          allow_registration = @allowRegistration,
          demo_enabled = @demoEnabled,
          updated_at = @now
         WHERE id = 1`,
      )
      .run({
        siteName: input.siteName?.trim() || current.siteName,
        allowRegistration: (input.allowRegistration ?? current.allowRegistration) ? 1 : 0,
        demoEnabled: (input.demoEnabled ?? current.demoEnabled) ? 1 : 0,
        now,
      })
    return this.get()
  }
}
