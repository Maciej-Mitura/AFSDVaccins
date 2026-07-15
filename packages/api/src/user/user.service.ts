import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { VerifiedFirebaseIdentity } from '../authentication/firebase.types'
import { CreateOwnUserInput } from './dto/create-own-user.input'
import { UpdateOwnUserInput } from './dto/update-own-user.input'
import { FirebaseEmailMissingException } from './exceptions/firebase-email-missing.exception'
import { UserNotRegisteredException } from './exceptions/user-not-registered.exception'
import { UserRole } from './user-role.enum'
import { User } from './user.entity'

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: MongoRepository<User>,
  ) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase()
  }

  normalizeName(value: string): string {
    return value.trim()
  }

  async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { firebaseUid },
    })
  }

  async requireByFirebaseUid(firebaseUid: string): Promise<User> {
    const user = await this.findByFirebaseUid(firebaseUid)

    if (!user) {
      throw new UserNotRegisteredException()
    }

    return user
  }

  async createOwnUser(
    identity: Pick<VerifiedFirebaseIdentity, 'uid' | 'email'>,
    input: CreateOwnUserInput,
  ): Promise<User> {
    const existingUser = await this.findByFirebaseUid(identity.uid)

    if (existingUser) {
      return existingUser
    }

    if (!identity.email) {
      throw new FirebaseEmailMissingException()
    }

    const user = this.userRepository.create({
      firebaseUid: identity.uid,
      email: this.normalizeEmail(identity.email),
      firstName: this.normalizeName(input.firstName),
      lastName: this.normalizeName(input.lastName),
      role: UserRole.APOTHEKER,
    })

    return this.userRepository.save(user)
  }

  async findUsersByRole(role: UserRole): Promise<User[]> {
    return this.userRepository.find({
      where: { role },
      order: { email: 'ASC' },
    })
  }

  async findUserById(id: string): Promise<User> {
    if (!ObjectId.isValid(id)) {
      throw new UserNotRegisteredException()
    }

    const user = await this.userRepository.findOne({
      where: { _id: new ObjectId(id) },
    })

    if (!user) {
      throw new UserNotRegisteredException()
    }

    return user
  }

  async updateOwnUser(
    firebaseUid: string,
    input: UpdateOwnUserInput,
  ): Promise<User> {
    const user = await this.requireByFirebaseUid(firebaseUid)

    user.firstName = this.normalizeName(input.firstName)
    user.lastName = this.normalizeName(input.lastName)

    return this.userRepository.save(user)
  }
}
