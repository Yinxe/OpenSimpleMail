import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export class ServerSettingsDto {
  @IsString()
  @Length(1, 255, { message: '服务器地址不能为空' })
  host!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number

  @IsBoolean()
  secure!: boolean
}

export class CreateAccountDto {
  @IsString()
  @Length(1, 80, { message: '账户名称不能为空' })
  name!: string

  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  @MaxLength(254)
  email!: string

  @IsString()
  @Length(1, 320, { message: '登录用户名不能为空' })
  username!: string

  @IsString()
  @Length(1, 512, { message: '请输入密码或应用专用密码' })
  password!: string

  @ValidateNested()
  @Type(() => ServerSettingsDto)
  imap!: ServerSettingsDto

  @ValidateNested()
  @Type(() => ServerSettingsDto)
  smtp!: ServerSettingsDto

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: '颜色格式应为 #RRGGBB' })
  color?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  signature?: string

  @IsOptional()
  @IsBoolean()
  skipTest?: boolean
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string

  @IsOptional()
  @IsString()
  @Length(1, 320)
  username?: string

  @IsOptional()
  @IsString()
  @Length(1, 512)
  password?: string

  @IsOptional()
  @ValidateNested()
  @Type(() => ServerSettingsDto)
  imap?: ServerSettingsDto

  @IsOptional()
  @ValidateNested()
  @Type(() => ServerSettingsDto)
  smtp?: ServerSettingsDto

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  signature?: string
}
