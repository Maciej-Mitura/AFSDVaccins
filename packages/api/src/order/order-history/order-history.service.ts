import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { tryParseGraphqlObjectId } from '../../common/mongodb/graphql-object-id.util'
import { ApothekerProfileService } from '../../profile/apotheker/apotheker-profile.service'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { UserService } from '../../user/user.service'
import { OrderForbiddenException } from '../exceptions/order.exceptions'
import { Order } from '../order.entity'
import {
  decodeOrderHistoryCursor,
  encodeOrderHistoryCursor,
} from './order-history.cursor'
import {
  deriveCancellationReason,
  orderIdString,
} from './order-history.derive'
import {
  OrderHistoryInvalidCursorException,
  OrderHistoryInvalidFirstException,
  OrderHistoryInvalidRangeException,
} from './order-history.exceptions'
import {
  ORDER_HISTORY_DEFAULT_FIRST,
  ORDER_HISTORY_MAX_FIRST,
  ORDER_HISTORY_MAX_SEARCH_LENGTH,
  OrderHistoryInput,
} from './order-history.input'
import {
  OrderHistoryConnection,
  OrderHistoryEdge,
  OrderHistoryItem,
  OrderHistoryPharmacy,
} from './order-history.types'

const OBJECT_ID_HEX_SUBSTRING = /^[a-fA-F0-9]{4,24}$/
const INVALID_SCOPED_APOTHEKER = Symbol('INVALID_SCOPED_APOTHEKER')

/** Native Mongo filter; Order._id GraphQL typing is string, so avoid Filter<Order>. */
type OrderHistoryMatch = Record<string, unknown>

@Injectable()
export class OrderHistoryService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: MongoRepository<Order>,
    private readonly userService: UserService,
    private readonly apothekerProfileService: ApothekerProfileService,
  ) {}

  async findOrderHistory(
    user: User,
    input: OrderHistoryInput,
  ): Promise<OrderHistoryConnection> {
    this.assertRoleAllowed(user)

    const first = this.resolveFirst(input.first)
    this.assertDateRanges(input)

    const scopedApothekerId = this.resolveScopedApothekerId(user, input)
    if (scopedApothekerId === INVALID_SCOPED_APOTHEKER) {
      return this.emptyConnection(0)
    }

    const searchFilter = this.buildSearchFilter(input.search)
    if (searchFilter === 'EMPTY') {
      return this.emptyConnection(0)
    }

    const baseMatch = this.buildBaseMatch(input, scopedApothekerId, searchFilter)
    const pageMatch = this.applyCursor(baseMatch, input.after)

    const totalCount = await this.orderRepository.countDocuments(baseMatch)

    const cursor = this.orderRepository.createEntityCursor(pageMatch)
    cursor.sort({ submittedAt: -1, _id: -1 })
    cursor.limit(first + 1)

    const page = await cursor.toArray()
    const hasNextPage = page.length > first
    const pageOrders = hasNextPage ? page.slice(0, first) : page

    const enrichment = await this.loadEnrichment(pageOrders)

    const edges: OrderHistoryEdge[] = pageOrders.map(order => {
      const id = orderIdString(order)
      const submittedAt = order.submittedAt
      return {
        cursor: encodeOrderHistoryCursor(submittedAt, id),
        node: this.toHistoryItem(order, enrichment),
      }
    })

    return {
      edges,
      pageInfo: {
        hasNextPage,
        endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
      },
      totalCount,
    }
  }

  private assertRoleAllowed(user: User): void {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.APOTHEKER) {
      // RolesGuard should already block BEZORGER; defense in depth.
      throw new OrderForbiddenException()
    }
  }

  private resolveFirst(first?: number): number {
    if (first === undefined || first === null) {
      return ORDER_HISTORY_DEFAULT_FIRST
    }

    if (
      !Number.isInteger(first) ||
      first < 1 ||
      first > ORDER_HISTORY_MAX_FIRST
    ) {
      throw new OrderHistoryInvalidFirstException()
    }

    return first
  }

  private assertDateRanges(input: OrderHistoryInput): void {
    if (
      input.deliveryDateFrom &&
      input.deliveryDateTo &&
      input.deliveryDateFrom > input.deliveryDateTo
    ) {
      throw new OrderHistoryInvalidRangeException(
        'deliveryDateFrom must not be after deliveryDateTo',
      )
    }

    if (
      input.submittedFrom &&
      input.submittedTo &&
      input.submittedFrom.getTime() > input.submittedTo.getTime()
    ) {
      throw new OrderHistoryInvalidRangeException(
        'submittedFrom must not be after submittedTo',
      )
    }
  }

  /**
   * ADMIN: optional apothekerId filter (invalid ObjectId → empty).
   * APOTHEKER: force own user id; ignore client-supplied apothekerId.
   */
  private resolveScopedApothekerId(
    user: User,
    input: OrderHistoryInput,
  ): string | null | typeof INVALID_SCOPED_APOTHEKER {
    if (user.role === UserRole.APOTHEKER) {
      return user._id.toString()
    }

    if (!input.apothekerId) {
      return null
    }

    const parsed = tryParseGraphqlObjectId(input.apothekerId)
    if (!parsed) {
      return INVALID_SCOPED_APOTHEKER
    }

    return parsed.stringValue
  }

  /**
   * Search v1: order id exact match (valid ObjectId) or hex substring via $expr.
   * Pharmacy-name search is intentionally omitted (would require join / post-filter).
   */
  private buildSearchFilter(
    search?: string,
  ): OrderHistoryMatch | null | 'EMPTY' {
    if (search === undefined || search === null) {
      return null
    }

    const trimmed = search.trim()
    if (trimmed.length === 0) {
      return null
    }

    if (trimmed.length > ORDER_HISTORY_MAX_SEARCH_LENGTH) {
      return 'EMPTY'
    }

    const exact = tryParseGraphqlObjectId(trimmed)
    if (exact && exact.stringValue === trimmed) {
      return { _id: exact.objectId }
    }

    if (!OBJECT_ID_HEX_SUBSTRING.test(trimmed)) {
      return 'EMPTY'
    }

    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return {
      $expr: {
        $regexMatch: {
          input: { $toString: '$_id' },
          regex: escaped,
          options: 'i',
        },
      },
    }
  }

  /**
   * Orders persist `apothekerId` as MongoDB ObjectId (`user._id` on create).
   * Match both ObjectId and string forms (same pattern as findQualifyingOrdersForRoute).
   */
  private apothekerIdMatch(apothekerId: string): OrderHistoryMatch {
    const parsed = tryParseGraphqlObjectId(apothekerId)
    if (!parsed) {
      return { apothekerId }
    }

    return {
      $or: [
        { apothekerId: parsed.objectId },
        { apothekerId: parsed.stringValue },
      ],
    }
  }

  private buildBaseMatch(
    input: OrderHistoryInput,
    apothekerId: string | null,
    searchFilter: OrderHistoryMatch | null,
  ): OrderHistoryMatch {
    const clauses: OrderHistoryMatch[] = []

    if (apothekerId) {
      clauses.push(this.apothekerIdMatch(apothekerId))
    }

    if (input.status !== undefined && input.status !== null) {
      clauses.push({ status: input.status })
    }

    if (input.deliveryDateFrom || input.deliveryDateTo) {
      const deliveryDate: Record<string, string> = {}
      if (input.deliveryDateFrom) {
        deliveryDate.$gte = input.deliveryDateFrom
      }
      if (input.deliveryDateTo) {
        deliveryDate.$lte = input.deliveryDateTo
      }
      clauses.push({ deliveryDate })
    }

    if (input.submittedFrom || input.submittedTo) {
      const submittedAt: Record<string, Date> = {}
      if (input.submittedFrom) {
        submittedAt.$gte = input.submittedFrom
      }
      if (input.submittedTo) {
        submittedAt.$lte = input.submittedTo
      }
      clauses.push({ submittedAt })
    }

    if (searchFilter) {
      clauses.push(searchFilter)
    }

    if (clauses.length === 0) {
      return {}
    }

    if (clauses.length === 1) {
      return clauses[0]
    }

    return { $and: clauses }
  }

  private applyCursor(
    baseMatch: OrderHistoryMatch,
    after?: string,
  ): OrderHistoryMatch {
    if (!after) {
      return baseMatch
    }

    const decoded = decodeOrderHistoryCursor(after)
    if (!decoded) {
      throw new OrderHistoryInvalidCursorException()
    }

    const cursorClause: OrderHistoryMatch = {
      $or: [
        { submittedAt: { $lt: decoded.submittedAt } },
        {
          submittedAt: decoded.submittedAt,
          _id: { $lt: decoded.objectId },
        },
      ],
    }

    if (Object.keys(baseMatch).length === 0) {
      return cursorClause
    }

    return { $and: [baseMatch, cursorClause] }
  }

  private emptyConnection(totalCount: number): OrderHistoryConnection {
    return {
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
      totalCount,
    }
  }

  private async loadEnrichment(orders: Order[]): Promise<{
    pharmaciesByUserId: Map<string, OrderHistoryPharmacy>
    displayNameByUserId: Map<string, string | null>
  }> {
    const pharmacyUserIds = [
      ...new Set(orders.map(order => order.apothekerId.toString())),
    ]
    const completerIds = [
      ...new Set(
        orders
          .map(order => order.deliveredByUserId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
          .map(id => id.toString()),
      ),
    ]

    const pharmaciesByUserId = new Map<string, OrderHistoryPharmacy>()
    await Promise.all(
      pharmacyUserIds.map(async userId => {
        try {
          const profile =
            await this.apothekerProfileService.findByUserId(userId)
          pharmaciesByUserId.set(userId, {
            apothekerUserId: userId,
            pharmacyName: profile?.pharmacyName ?? null,
            address: profile?.address ?? null,
          })
        } catch {
          pharmaciesByUserId.set(userId, {
            apothekerUserId: userId,
            pharmacyName: null,
            address: null,
          })
        }
      }),
    )

    const displayNameByUserId = new Map<string, string | null>()
    await Promise.all(
      completerIds.map(async userId => {
        displayNameByUserId.set(userId, await this.softDisplayName(userId))
      }),
    )

    return { pharmaciesByUserId, displayNameByUserId }
  }

  private async softDisplayName(userId: string): Promise<string | null> {
    if (!ObjectId.isValid(userId)) {
      return null
    }

    try {
      const user = await this.userService.findUserById(userId)
      const name = `${user.firstName} ${user.lastName}`.trim()
      return name.length > 0 ? name : null
    } catch {
      return null
    }
  }

  private toHistoryItem(
    order: Order,
    enrichment: {
      pharmaciesByUserId: Map<string, OrderHistoryPharmacy>
      displayNameByUserId: Map<string, string | null>
    },
  ): OrderHistoryItem {
    const id = orderIdString(order)
    const apothekerId = order.apothekerId.toString()
    const completedByUserId = order.deliveredByUserId
      ? order.deliveredByUserId.toString()
      : null

    return {
      id,
      status: order.status,
      orderLines: order.orderLines ?? [],
      totalQuantity: order.totalQuantity,
      submittedAt: order.submittedAt,
      deliveryDate: order.deliveryDate,
      cancelledAt: order.cancelledAt ?? null,
      // Persistence only — never substitute updatedAt.
      deliveredAt: order.deliveredAt ?? null,
      cancellationReason: deriveCancellationReason(order),
      pharmacy: enrichment.pharmaciesByUserId.get(apothekerId) ?? {
        apothekerUserId: apothekerId,
        pharmacyName: null,
        address: null,
      },
      completedByUserId,
      completedByDisplayName: completedByUserId
        ? (enrichment.displayNameByUserId.get(completedByUserId) ?? null)
        : null,
      deliveryMethod: order.deliveryMethod ?? null,
      routeId: null,
    }
  }
}
