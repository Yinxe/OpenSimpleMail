import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'

export class UpdatePreferencesDto {
  /** 0 disables automatic polling. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  refreshSeconds?: number

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(200)
  pageSize?: number

  @IsOptional()
  @IsBoolean()
  autoMarkRead?: boolean

  @IsOptional()
  @IsBoolean()
  loadRemoteImages?: boolean

  @IsOptional()
  @IsBoolean()
  desktopNotifications?: boolean

  @IsOptional()
  @IsIn(['account', 'unified'])
  defaultView?: 'account' | 'unified'

  @IsOptional()
  @IsIn(['comfortable', 'compact'])
  density?: 'comfortable' | 'compact'
}
