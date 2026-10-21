import { IsEmail, IsString, Length, MaxLength } from 'class-validator'

export class RegisterDto {
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  @MaxLength(254)
  email!: string

  @IsString()
  @Length(1, 60, { message: '昵称长度需在 1-60 个字符之间' })
  name!: string

  @IsString()
  @Length(8, 128, { message: '密码至少需要 8 个字符' })
  password!: string
}

export class RecoverAdminDto {
  @IsEmail({}, { message: '请输入管理员邮箱地址' })
  email!: string

  @IsString()
  @Length(12, 512, { message: '恢复密码长度不正确' })
  recoveryPassword!: string

  @IsString()
  @Length(8, 128, { message: '新密码至少需要 8 个字符' })
  newPassword!: string
}

export class LoginDto {
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email!: string

  @IsString()
  @Length(1, 128)
  password!: string
}

export class ChangePasswordDto {
  @IsString()
  @Length(1, 128, { message: '请输入当前密码' })
  currentPassword!: string

  @IsString()
  @Length(8, 128, { message: '新密码至少需要 8 个字符' })
  newPassword!: string
}

export class TotpCodeDto {
  @IsString()
  @Length(6, 12, { message: '请输入 6 位验证码' })
  code!: string
}

export class TwoFactorLoginDto {
  @IsString()
  @Length(10, 200)
  challengeToken!: string

  @IsString()
  @Length(6, 12, { message: '请输入 6 位验证码' })
  code!: string
}

export class DisableTotpDto {
  @IsString()
  @Length(1, 128, { message: '请输入当前密码' })
  password!: string
}
