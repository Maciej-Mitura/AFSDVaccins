import Joi from 'joi'

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  URL_FRONTEND: Joi.string().uri().required(),
  DB_HOST: Joi.string()
    .pattern(/^mongodb(\+srv)?:\/\//)
    .required()
    .messages({
      'string.pattern.base':
        'DB_HOST must be a MongoDB connection URL (mongodb:// or mongodb+srv://)',
    }),
  DB_NAME: Joi.string().min(1).required(),
})

export type EnvConfig = {
  NODE_ENV: 'development' | 'test' | 'production'
  PORT: number
  URL_FRONTEND: string
  DB_HOST: string
  DB_NAME: string
}

export const buildMongoUrl = (dbHost: string, dbName: string): string => {
  const normalizedHost = dbHost.endsWith('/') ? dbHost.slice(0, -1) : dbHost
  return `${normalizedHost}/${dbName}`
}
