import { IsBoolean, IsOptional, IsString, Length } from 'class-validator'

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @Length(1, 60, { message: '站点名称需在 1-60 个字符之间' })
  siteName?: string

  @IsOptional()
  @IsBoolean()
  allowRegistration?: boolean

  @IsOptional()
  @IsBoolean()
  demoEnabled?: boolean
}
