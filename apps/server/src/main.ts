import 'reflect-metadata'
import { existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import type { NextFunction, Request, Response } from 'express'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { APP_CONFIG, type AppConfig } from './config/app.config'

// Load the repository .env before Nest reads process.env. `npm run dev` starts
// this file with apps/server as the working directory, while `npm start` runs
// from the repository root; try both locations. Real environment variables
// (Docker, CI) always win: loadEnvFile does not overwrite them.
const envFile = [resolve('.env'), resolve(__dirname, '../../../.env')].find((file) =>
  existsSync(file),
)
if (envFile) loadEnvFile(envFile)

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap')
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
  })
  const config = app.get<AppConfig>(APP_CONFIG)

  if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy)
  app.setGlobalPrefix('api')
  app.use(cookieParser())
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameSrc: ["'self'", 'data:', 'blob:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: config.isProduction ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'no-referrer' },
      strictTransportSecurity: config.isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true }
        : false,
    }),
  )
  app.enableCors({ origin: config.webOrigins, credentials: true })
  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  // Reject state-changing requests coming from unexpected browser origins.
  // SameSite=Lax cookies already stop most cross-site posts; this is defence in depth.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const method = req.method.toUpperCase()
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next()
    const origin = req.get('origin')
    if (!origin) return next()
    const host = req.get('host')
    const allowed = new Set([...config.webOrigins, ...(host ? [`${req.protocol}://${host}`] : [])])
    if (!allowed.has(origin)) {
      res.status(403).json({ statusCode: 403, message: '请求来源不被允许' })
      return
    }
    next()
  })

  const webDist = config.webDist ?? join(__dirname, '..', '..', 'web', 'dist')
  const indexHtml = join(webDist, 'index.html')
  const hasWeb = existsSync(indexHtml)
  if (hasWeb) {
    app.useStaticAssets(webDist, { index: false, maxAge: '1h' })
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next()
      if (req.path.startsWith('/api')) return next()
      if (extname(req.path)) return next()
      res.sendFile(indexHtml)
    })
  }

  app.enableShutdownHooks()
  await app.listen(config.port, config.host)

  logger.log(`OpenSimpleMail listening on http://${config.host}:${config.port}`)
  logger.log(`API base: http://localhost:${config.port}/api`)
  logger.log(`Demo mode: ${config.demoEnabled ? 'enabled' : 'disabled'}`)
  logger.log(hasWeb ? `Serving web build from ${webDist}` : 'No web build found; API only')
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap')
  logger.error(
    'Failed to start OpenSimpleMail',
    error instanceof Error ? error.stack : String(error),
  )
  process.exitCode = 1
})
