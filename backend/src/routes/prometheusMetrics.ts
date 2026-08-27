import { Router, type Request, type Response } from 'express'
import { env } from '../schemas/env.js'
import { metricsRegister } from '../metrics.js'

export function createPrometheusMetricsRouter(): Router {
  const router = Router()

  router.get('/', async (req: Request, res: Response) => {
    const expectedToken = env.METRICS_TOKEN
    const authorization = req.headers.authorization
    const bearerPrefix = 'Bearer '

    if (
      !expectedToken ||
      !authorization?.startsWith(bearerPrefix) ||
      authorization.slice(bearerPrefix.length) !== expectedToken
    ) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    res.setHeader('Content-Type', metricsRegister.contentType)
    res.end(await metricsRegister.metrics())
  })

  return router
}
