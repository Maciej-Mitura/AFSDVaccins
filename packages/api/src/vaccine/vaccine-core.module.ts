import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { ApplicationCacheModule } from '../common/cache/application-cache.module'
import { Vaccine } from './vaccine.entity'
import { VaccineService } from './vaccine.service'

const isSchemaGeneration =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

const vaccineServiceProvider = isSchemaGeneration
  ? {
      provide: VaccineService,
      useValue: {
        createVaccine: () => Promise.resolve(null),
        findVaccines: () => Promise.resolve([]),
        findVaccineEntityById: () => Promise.resolve(null),
        findVaccineById: () => Promise.resolve(null),
        updateVaccine: () => Promise.resolve(null),
        setVaccineActive: () => Promise.resolve(null),
      },
    }
  : VaccineService

const persistenceImports = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([Vaccine])]

@Module({
  imports: [ApplicationCacheModule, ...persistenceImports],
  providers: [vaccineServiceProvider],
  exports: [VaccineService, ...persistenceImports],
})
export class VaccineCoreModule {}
