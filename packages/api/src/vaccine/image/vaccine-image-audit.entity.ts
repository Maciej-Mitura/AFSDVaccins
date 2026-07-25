import { Column, CreateDateColumn, Entity, Index, ObjectIdColumn } from 'typeorm'
import { ObjectId } from 'mongodb'

export enum VaccineImageAuditEventType {
  VACCINE_IMAGE_UPLOADED = 'VACCINE_IMAGE_UPLOADED',
  VACCINE_IMAGE_REPLACED = 'VACCINE_IMAGE_REPLACED',
  VACCINE_IMAGE_DELETED = 'VACCINE_IMAGE_DELETED',
  VACCINE_IMAGE_OVERRIDE_ACCEPTED = 'VACCINE_IMAGE_OVERRIDE_ACCEPTED',
  VACCINE_IMAGE_OVERRIDE_REJECTED = 'VACCINE_IMAGE_OVERRIDE_REJECTED',
}

/**
 * Append-only vaccine image lifecycle audit (StockAdjustment-style).
 * Never stores image bytes, Azure keys, connection strings, SAS URLs, or full OCR.
 */
@Entity('vaccine_image_audit_events')
export class VaccineImageAuditEvent {
  @ObjectIdColumn()
  _id!: string | ObjectId

  @Index()
  @Column()
  vaccineId!: string

  @Column()
  actorId!: string

  @Column()
  type!: VaccineImageAuditEventType

  @Column({ nullable: true })
  validationStatus?: string | null

  @Column({ nullable: true })
  provider?: string | null

  @Column({ default: false })
  replaced!: boolean

  /** Bounded override reason summary only (never full OCR). */
  @Column({ nullable: true })
  reasonSummary?: string | null

  @CreateDateColumn()
  createdAt!: Date
}
