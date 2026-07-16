import { Field, ID, ObjectType } from '@nestjs/graphql'
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ObjectIdColumn,
  UpdateDateColumn,
} from 'typeorm'

import { RouteTemplateStop } from './route-template-stop.embed'

@Entity('route_templates')
@ObjectType('RouteTemplate')
export class RouteTemplate {
  @ObjectIdColumn()
  _id!: string

  @Field(() => ID)
  get id(): string {
    return this._id
  }

  @Column()
  @Field()
  name!: string

  @Index({ unique: true })
  @Column()
  normalizedName!: string

  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  description?: string | null

  @Column({ default: true })
  @Field()
  active!: boolean

  @Index()
  @Column()
  @Field(() => ID)
  bezorgerProfileId!: string

  @Column()
  @Field(() => [RouteTemplateStop])
  stops!: RouteTemplateStop[]

  @CreateDateColumn()
  @Field()
  createdAt!: Date

  @UpdateDateColumn()
  @Field()
  updatedAt!: Date

  @Column()
  @Field(() => ID)
  createdByUserId!: string

  @Column()
  @Field(() => ID)
  updatedByUserId!: string
}
