import type { AddressDto } from '@osm/shared'

export interface DemoAttachment {
  filename: string
  contentType: string
  /** Base64 encoded content. */
  content: string
  inline?: boolean
  cid?: string
}

export interface DemoMessage {
  uid: number
  mailbox: string
  subject: string
  from: AddressDto[]
  to: AddressDto[]
  cc: AddressDto[]
  bcc: AddressDto[]
  replyTo: AddressDto[]
  date: string
  flags: string[]
  text: string
  html: string | null
  attachments: DemoAttachment[]
  messageId: string
  inReplyTo: string | null
  references: string[]
}

export interface DemoStore {
  nextUid: number
  messages: DemoMessage[]
}

export interface DemoFolder {
  path: string
  name: string
  specialUse: string
}

export const DEMO_FOLDERS: DemoFolder[] = [
  { path: 'INBOX', name: '收件箱', specialUse: '\\Inbox' },
  { path: 'Starred', name: '星标邮件', specialUse: '\\Flagged' },
  { path: 'Sent', name: '已发送', specialUse: '\\Sent' },
  { path: 'Drafts', name: '草稿箱', specialUse: '\\Drafts' },
  { path: 'Archive', name: '归档', specialUse: '\\Archive' },
  { path: 'Junk', name: '垃圾邮件', specialUse: '\\Junk' },
  { path: 'Trash', name: '废纸篓', specialUse: '\\Trash' },
]

export const DEMO_ACCOUNT_EMAIL = 'demo@opensimplemail.local'
export const DEMO_ACCOUNT_NAME = 'OpenSimpleMail 演示'

const INVOICE_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
).toString('base64')

const AVATAR_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAWklEQVR4nO3PQQ0AIBDAsAP/nuGNAvZoFSzZOjNnyNi5cwfgUQCeBeBZAP4F4FkAngXgWQCeBeBZAP4F4FkAngXgWQCeBeBZAP4F4FkAngXgWQCeBeBZAP4F4FkAnoUDH7QBPdGvJ0kAAAAASUVORK5CYII=',
  'base64',
).toString('base64')

function emailShell(options: {
  title: string
  accent?: string
  body: string
  footer?: string
}): string {
  const accent = options.accent ?? '#0f766e'
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#24211d;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fffdf8;border:1px solid #e4ded2;border-radius:10px;overflow:hidden;">
<tr><td style="padding:28px 32px 8px 32px;">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${accent};font-weight:700;">${options.title}</div>
</td></tr>
<tr><td style="padding:8px 32px 32px 32px;font-size:15px;line-height:1.7;">${options.body}</td></tr>
<tr><td style="padding:18px 32px;background:#faf7f0;border-top:1px solid #eee8dc;font-size:12px;color:#8a8174;line-height:1.6;">${
    options.footer ?? '你收到这封邮件是因为你订阅了 OpenSimpleMail 的更新。'
  }</td></tr>
</table>
</td></tr></table>
</body></html>`
}

function button(label: string, href: string, color = '#0f766e'): string {
  return `<a href="${href}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600;margin:12px 0;">${label}</a>`
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 14px 0;">${text}</p>`
}

function makeMessages(now: Date): DemoMessage[] {
  const at = (daysAgo: number, hour: number, minute = 0): string => {
    const date = new Date(now)
    date.setDate(date.getDate() - daysAgo)
    date.setHours(hour, minute, 0, 0)
    return date.toISOString()
  }
  const me: AddressDto = { name: DEMO_ACCOUNT_NAME, address: DEMO_ACCOUNT_EMAIL }
  let uid = 1000
  const message = (
    input: Omit<DemoMessage, 'uid' | 'messageId' | 'inReplyTo' | 'references'> & {
      id: string
      inReplyTo?: string
      references?: string[]
    },
  ): DemoMessage => ({
    ...input,
    uid: uid++,
    messageId: `<${input.id}@demo.opensimplemail.local>`,
    inReplyTo: input.inReplyTo ?? null,
    references: input.references ?? [],
  })

  const messages: DemoMessage[] = []

  messages.push(
    message({
      id: 'github-issue',
      mailbox: 'INBOX',
      subject: '[open-simple-mail] 你的第一个 Issue 已收到回复',
      from: [{ name: 'GitHub', address: 'notifications@github.com' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [{ name: 'GitHub', address: 'reply@github.com' }],
      date: at(0, 8, 42),
      flags: ['\\Flagged'],
      text: 'Yinx commented on issue #12: 多账号统一收件箱的实现思路\n\n看起来不错。我们可以先按账号分组，再按时间合并。',
      html: emailShell({
        title: 'GitHub · Issue #12',
        accent: '#24292f',
        body: `${paragraph('<strong>Yinx</strong> 在 issue #12 中回复了你：')}
<div style="background:#f6f8fa;border-left:3px solid #24292f;padding:12px 16px;margin:16px 0;color:#3b4249;">多账号统一收件箱可以按账号分组，也可以完全按时间合并。我倾向于后者，加一个账号筛选器就够了。</div>
${button('查看 Issue', 'https://github.com/')}
<p style="margin:14px 0 0 0;color:#6b7280;font-size:13px;">你可以在 GitHub 通知设置中调整订阅。</p>`,
      }),
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'otp-canglan',
      mailbox: 'INBOX',
      subject: '沧蓝api 登录验证码',
      from: [{ name: '沧蓝api', address: 'noreply@canglan.api' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(0, 9, 12),
      flags: [],
      text: `demo1423，您好：

您的验证码是：

090b51

验证码将在 15 分钟后失效。

如果不是您本人操作，请忽略此邮件。`,
      html: emailShell({
        title: '沧蓝api',
        accent: '#0f766e',
        body: `${paragraph('demo1423，您好：')}
${paragraph('您的验证码是：')}
<div style="margin:18px 0;padding:20px 18px;border:1px solid #e4ded2;border-radius:10px;background:#faf7f0;text-align:center;">
<div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:38px;letter-spacing:8px;font-weight:600;color:#24211d;">090b51</div>
</div>
<p style="margin:0 0 14px 0;">验证码将在 <strong>15 分钟</strong>后失效。</p>
<p style="margin:0;color:#6b7280;font-size:13px;">如果不是您本人操作，请忽略此邮件。</p>`,
        footer: 'This email was sent by 沧蓝api. Please do not reply directly.',
      }),
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'otp-login',
      mailbox: 'INBOX',
      subject: 'OpenSimpleMail 登录验证码 · 482913',
      from: [{ name: 'OpenSimpleMail 安全中心', address: 'security@opensimplemail.local' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(0, 9, 5),
      flags: [],
      text: '你的登录验证码是 482913，10 分钟内有效。请勿将验证码转发给他人。',
      html: emailShell({
        title: '安全验证',
        accent: '#c4553b',
        body: `${paragraph('你正在登录 <strong>OpenSimpleMail</strong>，请使用下面的验证码完成验证：')}
<div style="margin:18px 0;padding:20px 18px;border:1px solid #e4ded2;border-radius:10px;background:#faf7f0;text-align:center;">
<div style="font-size:11px;letter-spacing:2px;color:#8a8174;">登录验证码</div>
<div style="margin-top:10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:38px;letter-spacing:10px;font-weight:600;color:#24211d;">482913</div>
<div style="margin-top:10px;font-size:12px;color:#8a8174;">10 分钟内有效</div>
</div>
<p style="margin:0;color:#6b7280;font-size:13px;">如果这不是你本人的操作，请忽略这封邮件，并检查账号安全设置。</p>`,
        footer: '这是一封系统自动发送的邮件，请勿直接回复。',
      }),
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'figma-comment',
      mailbox: 'INBOX',
      subject: 'Figma：Mailbox redesign 有 2 条新评论',
      from: [{ name: 'Figma', address: 'notifications@figma.com' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(0, 7, 18),
      flags: [],
      text: 'Mia 在 Mailbox redesign 中提到了你。',
      html: emailShell({
        title: 'Figma',
        accent: '#a259ff',
        body: `${paragraph('<strong>Mia</strong> 在 <strong>Mailbox redesign</strong> 中提到了你：')}
<div style="display:flex;gap:12px;align-items:center;background:#faf7ff;border:1px solid #ece2ff;border-radius:8px;padding:14px;margin:16px 0;">
<img src="cid:figma-avatar" width="44" height="44" alt="Mia" style="border-radius:50%;display:block;">
<div><div style="font-weight:600;">侧边栏的未读计数再克制一点？</div><div style="color:#7c6b91;font-size:13px;margin-top:4px;">10 分钟前 · 画板 03</div></div>
</div>
${button('在 Figma 中打开', 'https://www.figma.com/', '#a259ff')}`,
      }),
      attachments: [
        {
          filename: 'figma-avatar.png',
          contentType: 'image/png',
          content: AVATAR_PNG,
          inline: true,
          cid: 'figma-avatar',
        },
      ],
    }),
  )

  messages.push(
    message({
      id: 'stripe-invoice',
      mailbox: 'INBOX',
      subject: '你的 10 月账单已生成 · ¥128.00',
      from: [{ name: 'Stripe', address: 'invoices@stripe.com' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(1, 10, 5),
      flags: ['\\Seen'],
      text: '感谢使用 OpenSimpleMail Pro。本月账单 ¥128.00，已通过 Visa •••• 4242 支付。',
      html: emailShell({
        title: '收据',
        accent: '#635bff',
        body: `${paragraph('感谢使用 <strong>OpenSimpleMail Pro</strong>。本月账单已支付成功。')}
<table role="presentation" width="100%" style="border-collapse:collapse;margin:8px 0 18px 0;font-size:14px;">
<tr><td style="padding:8px 0;border-bottom:1px solid #eee8dc;color:#8a8174;">金额</td><td style="padding:8px 0;border-bottom:1px solid #eee8dc;text-align:right;font-weight:600;">¥128.00</td></tr>
<tr><td style="padding:8px 0;border-bottom:1px solid #eee8dc;color:#8a8174;">付款方式</td><td style="padding:8px 0;border-bottom:1px solid #eee8dc;text-align:right;">Visa •••• 4242</td></tr>
<tr><td style="padding:8px 0;color:#8a8174;">发票编号</td><td style="padding:8px 0;text-align:right;">INV-2026-1021</td></tr>
</table>
${button('下载发票', 'https://dashboard.stripe.com/', '#635bff')}`,
      }),
      attachments: [
        { filename: 'invoice-2026-10.pdf', contentType: 'application/pdf', content: INVOICE_PDF },
      ],
    }),
  )

  messages.push(
    message({
      id: 'linear-digest',
      mailbox: 'INBOX',
      subject: 'Linear 周报：本周完成 23 个 issue',
      from: [{ name: 'Linear', address: 'digest@linear.app' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(1, 8, 30),
      flags: ['\\Seen'],
      text: '本周团队完成了 23 个 issue，新增 11 个。',
      html: emailShell({
        title: 'Linear Weekly',
        accent: '#5e6ad2',
        body: `${paragraph('你的团队本周完成了 <strong>23</strong> 个 issue，新增 11 个，整体周期时间下降 8%。')}
<div style="display:flex;gap:10px;margin:16px 0;">
<div style="flex:1;background:#f6f7ff;border:1px solid #e6e8ff;border-radius:8px;padding:14px;"><div style="font-size:24px;font-weight:700;color:#5e6ad2;">23</div><div style="font-size:12px;color:#7c81a8;">已完成</div></div>
<div style="flex:1;background:#f6f7ff;border:1px solid #e6e8ff;border-radius:8px;padding:14px;"><div style="font-size:24px;font-weight:700;color:#5e6ad2;">11</div><div style="font-size:12px;color:#7c81a8;">进行中</div></div>
<div style="flex:1;background:#f6f7ff;border:1px solid #e6e8ff;border-radius:8px;padding:14px;"><div style="font-size:24px;font-weight:700;color:#5e6ad2;">2.4d</div><div style="font-size:12px;color:#7c81a8;">平均周期</div></div>
</div>`,
      }),
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'dinner',
      mailbox: 'INBOX',
      subject: '周五晚饭？',
      from: [{ name: '王小明', address: 'xiaoming.wang@example.com' }],
      to: [me],
      cc: [{ name: '李雷', address: 'lilei@example.com' }],
      bcc: [],
      replyTo: [],
      date: at(2, 21, 12),
      flags: [],
      text: '周五晚上有空吗？想去试试公司旁边新开的云南菜，七点左右。',
      html: null,
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'vercel-failed',
      mailbox: 'INBOX',
      subject: '部署失败：open-simple-mail (production)',
      from: [{ name: 'Vercel', address: 'notifications@vercel.com' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(2, 16, 48),
      flags: ['\\Flagged'],
      text: 'Build failed: Type error in src/components/MailList.tsx:42',
      html: emailShell({
        title: 'Deployment failed',
        accent: '#e5484d',
        body: `${paragraph('项目 <strong>open-simple-mail</strong> 的生产环境部署失败。')}
<div style="background:#1f1d1a;color:#f4f1ea;border-radius:8px;padding:16px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.6;overflow-x:auto;">
<span style="color:#ff8b8b;">error</span> Type error: Property 'mailbox' does not exist on type 'MessageSummary'.<br>
&nbsp;&nbsp;42 | const path = message.mailbox<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;^
</div>
<p style="margin:16px 0 0 0;">${button('查看构建日志', 'https://vercel.com/', '#e5484d')}</p>`,
      }),
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'notion-invite',
      mailbox: 'INBOX',
      subject: '你被邀请加入 Product Wiki',
      from: [{ name: 'Notion', address: 'team@makenotion.com' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(3, 11, 0),
      flags: ['\\Seen'],
      text: 'Yinx 邀请你加入 Product Wiki。',
      html: emailShell({
        title: 'Notion',
        accent: '#2f2f2f',
        body: `${paragraph('<strong>Yinx</strong> 邀请你加入工作区 <strong>Product Wiki</strong>。')}
${button('接受邀请', 'https://www.notion.so/')}
<p style="color:#8a8174;font-size:13px;margin-top:14px;">此邀请 7 天后失效。</p>`,
      }),
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'hn-digest',
      mailbox: 'INBOX',
      subject: 'Hacker News 每日精选：构建可维护的邮件客户端',
      from: [{ name: 'Hacker News', address: 'digest@hackernewsletter.com' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(3, 7, 20),
      flags: ['\\Seen'],
      text: '1. Building a mail client that lasts\n2. IMAP is still weird\n3. The case for plain text email',
      html: emailShell({
        title: 'Hacker News Daily',
        accent: '#ff6600',
        body: `<ol style="padding-left:20px;margin:0 0 16px 0;">
<li style="margin-bottom:12px;"><a href="https://news.ycombinator.com/" style="color:#1f5fbf;text-decoration:none;">Building a mail client that lasts</a><div style="color:#8a8174;font-size:13px;margin-top:2px;">412 points · 138 comments</div></li>
<li style="margin-bottom:12px;"><a href="https://news.ycombinator.com/" style="color:#1f5fbf;text-decoration:none;">IMAP is still weird</a><div style="color:#8a8174;font-size:13px;margin-top:2px;">208 points · 91 comments</div></li>
<li><a href="https://news.ycombinator.com/" style="color:#1f5fbf;text-decoration:none;">The case for plain text email</a><div style="color:#8a8174;font-size:13px;margin-top:2px;">97 points · 44 comments</div></li>
</ol>`,
      }),
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'apple-signin',
      mailbox: 'INBOX',
      subject: '你的 Apple ID 被用于在新设备上登录',
      from: [{ name: 'Apple', address: 'no_reply@email.apple.com' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(4, 22, 3),
      flags: [],
      text: '你的 Apple ID 刚在 MacBook Pro 上登录。如果不是你本人操作，请立即修改密码。',
      html: emailShell({
        title: 'Apple ID',
        accent: '#1d1d1f',
        body: `${paragraph('你的 Apple ID 刚在以下设备上登录：')}
<div style="background:#f5f5f7;border-radius:8px;padding:16px;margin:12px 0;">
<div style="font-weight:600;">MacBook Pro 14"</div>
<div style="color:#6e6e73;font-size:13px;margin-top:4px;">上海 · 2026-10-17 22:03</div>
</div>
${paragraph('如果不是你本人操作，请立即修改密码并检查账户安全设置。')}
${button('检查账户安全', 'https://appleid.apple.com/', '#1d1d1f')}`,
      }),
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'geekweekly',
      mailbox: 'INBOX',
      subject: '技术周刊 #218：前端性能优化的 7 个细节',
      from: [{ name: '极客时间', address: 'weekly@geekbang.org' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(5, 9, 0),
      flags: ['\\Seen'],
      text: '本周主题：前端性能优化的 7 个细节，以及一个值得关注的 Rust 项目。',
      html: emailShell({
        title: '技术周刊 #218',
        accent: '#e85d3f',
        body: `${paragraph('本周我们聊了聊那些容易被忽略、却能显著提升体验的前端细节。')}
<img src="https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=60" alt="桌面上的代码与咖啡" width="600" style="width:100%;height:auto;border-radius:8px;display:block;margin:16px 0;">
<h2 style="font-size:18px;margin:20px 0 8px 0;">01 · 从 200ms 到 60ms</h2>
${paragraph('一次真实的首屏优化复盘：预连接、字体子集化、以及把首屏不需要的请求延后。')}
<h2 style="font-size:18px;margin:20px 0 8px 0;">02 · 值得关注的 Rust 项目</h2>
${paragraph('一个用 Rust 重写的 IMAP 解析器，吞吐量是同类实现的 3 倍。')}
${button('阅读全文', 'https://time.geekbang.org/', '#e85d3f')}`,
      }),
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'airbnb',
      mailbox: 'INBOX',
      subject: '预订确认：杭州 · 西湖边的老房子',
      from: [{ name: 'Airbnb', address: 'automated@airbnb.com' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(6, 14, 26),
      flags: ['\\Seen'],
      text: '你的预订已确认，入住时间 11 月 7 日。',
      html: emailShell({
        title: '预订确认',
        accent: '#ff385c',
        body: `${paragraph('你的预订已确认，房东会在入住前一天发送详细指引。')}
<div style="border:1px solid #eee8dc;border-radius:8px;overflow:hidden;margin:16px 0;">
<div style="background:#fff1f3;padding:14px 16px;font-weight:600;color:#ff385c;">11 月 7 日 — 11 月 10 日 · 3 晚</div>
<div style="padding:16px;">
<div style="font-weight:600;margin-bottom:4px;">西湖边的老房子</div>
<div style="color:#8a8174;font-size:13px;">杭州，浙江 · 整套公寓</div>
</div></div>
${button('查看行程', 'https://www.airbnb.cn/', '#ff385c')}`,
      }),
      attachments: [
        { filename: 'itinerary.pdf', contentType: 'application/pdf', content: INVOICE_PDF },
      ],
    }),
  )

  messages.push(
    message({
      id: 'supabase-limit',
      mailbox: 'INBOX',
      subject: '项目 open-simple-mail 的数据库用量已达 82%',
      from: [{ name: 'Supabase', address: 'noreply@supabase.io' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(7, 6, 10),
      flags: [],
      text: '你的免费项目数据库用量已达 82%，请考虑升级或清理数据。',
      html: emailShell({
        title: '用量提醒',
        accent: '#3ecf8e',
        body: `${paragraph('项目 <strong>open-simple-mail</strong> 的数据库用量已达 <strong>82%</strong>。')}
<div style="background:#f0fdf7;border:1px solid #d3f5e5;border-radius:8px;padding:16px;margin:16px 0;">
<div style="height:8px;background:#d9f7e9;border-radius:99px;overflow:hidden;"><div style="height:8px;width:82%;background:#3ecf8e;"></div></div>
<div style="font-size:13px;color:#4b7c68;margin-top:8px;">412 MB / 500 MB</div>
</div>`,
      }),
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'douban',
      mailbox: 'INBOX',
      subject: '你关注的《设计中的设计》有了新书评',
      from: [{ name: '豆瓣', address: 'no-reply@douban.com' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(9, 19, 44),
      flags: ['\\Seen'],
      text: '原研哉《设计中的设计》新增 3 篇书评。',
      html: emailShell({
        title: '豆瓣读书',
        accent: '#2e963b',
        body: `${paragraph('你关注的 <strong>《设计中的设计》</strong> 新增了 3 篇书评。')}
<div style="border-left:3px solid #2e963b;padding-left:14px;color:#5f5a52;margin:14px 0;">“设计不是一种技能，而是捕捉事物本质的感觉能力。” </div>
${button('查看书评', 'https://book.douban.com/', '#2e963b')}`,
      }),
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'calendar-invite',
      mailbox: 'INBOX',
      subject: '邀请：Design sync · 周四 10:30',
      from: [{ name: 'Google Calendar', address: 'calendar-notification@google.com' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(10, 12, 0),
      flags: ['\\Seen'],
      text: 'Design sync，周四 10:30 - 11:15，会议室 A。',
      html: emailShell({
        title: '日历邀请',
        accent: '#1a73e8',
        body: `${paragraph('<strong>Design sync</strong>')}
<div style="border:1px solid #e4e7ec;border-radius:8px;padding:16px;margin:12px 0;">
<div style="font-weight:600;">周四 10:30 – 11:15</div>
<div style="color:#6b7280;font-size:13px;margin-top:4px;">会议室 A · 杭州办公室</div>
</div>
${paragraph('议程：多账号收件箱交互、撰写窗口的键盘操作。')}
${button('加入会议', 'https://meet.google.com/', '#1a73e8')}`,
      }),
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'stripe-payout',
      mailbox: 'INBOX',
      subject: '打款成功：¥2,480.00 已到账',
      from: [{ name: 'Stripe', address: 'payouts@stripe.com' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(0, 6, 5),
      flags: [],
      text: '你的打款 ¥2,480.00 已到账。',
      html: emailShell({
        title: 'Payout sent',
        accent: '#635bff',
        body: `${paragraph('一笔新的打款已汇入你的银行账户。')}
<div style="font-size:32px;font-weight:700;letter-spacing:-1px;margin:8px 0 4px 0;">¥2,480.00</div>
<div style="color:#8a8174;font-size:13px;margin-bottom:16px;">预计 1–2 个工作日到账</div>`,
      }),
      attachments: [],
    }),
  )

  // Sent, drafts, archive, trash, junk
  messages.push(
    message({
      id: 'sent-reply',
      mailbox: 'Sent',
      subject: 'Re: 周五晚饭？',
      from: [me],
      to: [{ name: '王小明', address: 'xiaoming.wang@example.com' }],
      cc: [{ name: '李雷', address: 'lilei@example.com' }],
      bcc: [],
      replyTo: [],
      date: at(2, 21, 30),
      flags: ['\\Seen'],
      text: '可以，周五七点见。我来订位。',
      html: null,
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'sent-invoice',
      mailbox: 'Sent',
      subject: '10 月设计外包结算单',
      from: [me],
      to: [{ name: 'Mia Chen', address: 'mia@studio.example.com' }],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(4, 18, 20),
      flags: ['\\Seen'],
      text: '附件是本月的结算单，请查收。',
      html: emailShell({
        title: '结算单',
        body: `${paragraph('Mia 你好，')}${paragraph('附件是本月的结算单，请查收。如有问题随时联系我。')}${paragraph('谢谢！<br>Yinx')}`,
      }),
      attachments: [
        { filename: 'settlement-oct.pdf', contentType: 'application/pdf', content: INVOICE_PDF },
      ],
    }),
  )

  messages.push(
    message({
      id: 'sent-welcome',
      mailbox: 'Sent',
      subject: '欢迎使用 OpenSimpleMail',
      from: [me],
      to: [{ name: '新用户', address: 'newuser@example.com' }],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(12, 10, 0),
      flags: ['\\Seen'],
      text: '欢迎！这是一封从 OpenSimpleMail 发出的测试邮件。',
      html: emailShell({
        title: 'Welcome',
        body: `${paragraph('欢迎使用 <strong>OpenSimpleMail</strong>。')}${paragraph('这是一封从 OpenSimpleMail 发出的测试邮件。你可以添加多个邮箱，在同一个界面里统一处理。')}${button('开始使用', 'http://localhost:5173/')}`,
      }),
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'draft-quarterly',
      mailbox: 'Drafts',
      subject: 'Q4 路线图草稿',
      from: [me],
      to: [{ name: '团队', address: 'team@example.com' }],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(1, 23, 10),
      flags: ['\\Draft', '\\Seen'],
      text: 'Q4 重点：多账号统一收件箱、离线缓存、移动端适配。',
      html: null,
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'archive-1',
      mailbox: 'Archive',
      subject: '2026 年 9 月报销凭证',
      from: [{ name: '财务部', address: 'finance@example.com' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(21, 9, 0),
      flags: ['\\Seen'],
      text: '9 月报销已审批通过。',
      html: null,
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'archive-2',
      mailbox: 'Archive',
      subject: '旧域名迁移完成通知',
      from: [{ name: 'Namecheap', address: 'support@namecheap.com' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(30, 15, 30),
      flags: ['\\Seen'],
      text: '域名迁移已完成。',
      html: null,
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'trash-1',
      mailbox: 'Trash',
      subject: '限时优惠：云服务器 1 折起',
      from: [{ name: '某云厂商', address: 'promo@cloud.example.com' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(3, 8, 0),
      flags: ['\\Seen'],
      text: '限时优惠，点击查看。',
      html: null,
      attachments: [],
    }),
  )

  messages.push(
    message({
      id: 'junk-1',
      mailbox: 'Junk',
      subject: '恭喜您获得抽奖资格',
      from: [{ name: '幸运用户', address: 'winner@spam.example.com' }],
      to: [me],
      cc: [],
      bcc: [],
      replyTo: [],
      date: at(8, 3, 12),
      flags: [],
      text: '点击链接领取您的奖品。',
      html: null,
      attachments: [],
    }),
  )

  return messages
}

export function createDemoStore(now = new Date()): DemoStore {
  const messages = makeMessages(now)
  return {
    nextUid: Math.max(...messages.map((item) => item.uid)) + 1,
    messages,
  }
}
