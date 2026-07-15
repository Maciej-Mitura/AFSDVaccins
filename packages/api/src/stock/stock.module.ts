import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AuthenticationModule } from '../authentication/authentication.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { UserModule } from '../user/user.module'
import { Vaccine } from '../vaccine/vaccine.entity'
import { VaccineModule } from '../vaccine/vaccine.module'
import { StockAdjustment } from './stock-adjustment.entity'
import { StockAdjustmentPersistenceService } from './stock-adjustment.persistence'
import { StockAdjustmentRepository } from './stock-adjustment.repository'
import { StockNotificationService } from './stock-notification.service'
import { StockResolver } from './stock.resolver'
import { StockService } from './stock.service'
import { VaccineStockRepository } from './vaccine-stock.repository'

const isSchemaGeneration =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

const stockServiceProvider = isSchemaGeneration
  ? {
      provide: StockService,
      useValue: {
        adjustVaccineStock: () => Promise.resolve(null),
        findStockAdjustments: () => Promise.resolve([]),
        findVaccineStockHistory: () => Promise.resolve([]),
      },
    }
  : StockService

const stockNotificationServiceProvider = isSchemaGeneration
  ? {
      provide: StockNotificationService,
      useValue: {
        notifyAdminsIfEnteredLowStock: () => Promise.resolve(undefined),
      },
    }
  : StockNotificationService

const vaccineStockRepositoryProvider = isSchemaGeneration
  ? {
      provide: VaccineStockRepository,
      useValue: {
        findVaccineByGraphqlId: () => Promise.resolve(null),
        findVaccineByObjectId: () => Promise.resolve(null),
        adjustStockQuantity: () => Promise.resolve(null),
      },
    }
  : VaccineStockRepository

const stockAdjustmentRepositoryProvider = isSchemaGeneration
  ? {
      provide: StockAdjustmentRepository,
      useValue: {
        insertManualAdjustment: () => Promise.resolve(null),
        insertIdempotentAdjustment: () => Promise.resolve(null),
      },
    }
  : StockAdjustmentRepository

const stockAdjustmentPersistenceProvider = isSchemaGeneration
  ? {
      provide: StockAdjustmentPersistenceService,
      useValue: {
        onModuleInit: () => Promise.resolve(undefined),
        initializeStockAdjustmentPersistence: () => Promise.resolve(undefined),
        repairLegacyNullIdempotencyKeys: () => Promise.resolve(0),
        ensurePartialUniqueIdempotencyIndex: () => Promise.resolve(undefined),
      },
    }
  : StockAdjustmentPersistenceService

const persistenceImports = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([StockAdjustment, Vaccine])]

@Module({
  imports: [
    AuthenticationModule,
    UserModule,
    VaccineModule,
    NotificationsModule,
    ...persistenceImports,
  ],
  providers: [
    stockServiceProvider,
    stockNotificationServiceProvider,
    vaccineStockRepositoryProvider,
    stockAdjustmentRepositoryProvider,
    stockAdjustmentPersistenceProvider,
    StockResolver,
  ],
  exports: [StockService],
})
export class StockModule {}
