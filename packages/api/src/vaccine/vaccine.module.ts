import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AuthenticationModule } from '../authentication/authentication.module'
import { UserModule } from '../user/user.module'
import { Vaccine } from './vaccine.entity'
import { VaccineResolver } from './vaccine.resolver'
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
  imports: [AuthenticationModule, UserModule, ...persistenceImports],
  providers: [vaccineServiceProvider, VaccineResolver],
  exports: [VaccineService],
})
export class VaccineModule {}
