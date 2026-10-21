import { Type } from 'class-transformer'
import { IsBoolean, IsEmail, IsString, Length, MaxLength, ValidateNested } from 'class-validator'

export class SetupAdminDto {
  @IsString()
  @Length(1, 60, { message: '管理员昵称需在 1-60 个字符之间' })
  name!: string

  @IsEmail({}, { message: '请输入有效的管理员邮箱地址' })
  @MaxLength(254)
  email!: string

  @IsString()
  @Length(8, 128, { message: '管理员密码至少需要 8 个字符' })
  password!: string
}

export class SetupDto {
  @IsString()
  @Length(1, 60, { message: '站点名称需在 1-60 个字符之间' })
  siteName!: string

  @IsBoolean()
  allowRegistration!: boolean

  @IsBoolean()
  demoEnabled!: boolean

  @ValidateNested()
  @Type(() => SetupAdminDto)
  admin!: SetupAdminDto
}
