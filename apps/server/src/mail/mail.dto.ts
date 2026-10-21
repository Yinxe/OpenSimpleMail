import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

export class ListMessagesQueryDto {
  @IsString()
  @Length(1, 512)
  mailbox!: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 30

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string
}

export class UnifiedQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 512)
  mailbox = 'INBOX'

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 30

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string
}

export class MailboxQueryDto {
  @IsString()
  @Length(1, 512)
  mailbox!: string
}

export class RenameMailboxDto {
  @IsString()
  @Length(1, 512)
  path!: string

  @IsString()
  @Length(1, 512)
  newPath!: string
}

export class FlagUpdateDto {
  @IsOptional()
  @IsBoolean()
  seen?: boolean

  @IsOptional()
  @IsBoolean()
  flagged?: boolean
}

export class BulkFlagUpdateDto {
  @IsString()
  @Length(1, 512)
  mailbox!: string

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  uids!: number[]

  @IsOptional()
  @IsBoolean()
  seen?: boolean

  @IsOptional()
  @IsBoolean()
  flagged?: boolean
}

export class BulkMoveDto {
  @IsString()
  @Length(1, 512)
  mailbox!: string

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  uids!: number[]

  @IsString()
  @Length(1, 512)
  destination!: string
}

export class BulkDeleteDto {
  @IsString()
  @Length(1, 512)
  mailbox!: string

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  uids!: number[]
}

export class MoveMessageDto {
  @IsString()
  @Length(1, 512)
  mailbox!: string

  @IsString()
  @Length(1, 512)
  destination!: string
}

export class SendMessageDto {
  @IsString()
  @MaxLength(4000)
  to!: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  cc?: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  bcc?: string

  @IsString()
  @MaxLength(500)
  subject!: string

  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  text?: string

  @IsOptional()
  @IsString()
  @MaxLength(1_000_000)
  html?: string

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  inReplyTo?: string

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  references?: string
}
