import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { OrderNotificationService } from '../notifications/order-notification.service'
import { BusinessNotificationProducerService } from '../notifications/business-notification-producer.service'
import { tryParseGraphqlObjectId } from '../common/mongodb/graphql-object-id.util'
import { ApplicationSettings } from '../settings/settings.entity'
import { SettingsService } from '../settings/settings.service'
import { StockService } from '../stock/stock.service'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import {
  VaccineInactiveException,
  VaccineNotFoundException,
} from '../vaccine/exceptions/vaccine.exceptions'
import { Vaccine } from '../vaccine/vaccine.entity'
import { VaccineService } from '../vaccine/vaccine.service'
import {
  AdminDailyOrderOverview,
  AdminDailyPharmacistSummary,
  AdminDailyVaccineQuantity,
  AdminOrderStatusCount,
} from './admin-daily-order-overview.type'
import { AdminWeeklyStatistics } from './admin-weekly-statistics.type'
import { CLOCK } from './clock.provider'
import type { Clock } from './clock.provider'
import {
  getIsoWeekYear,
  getIsoWeekYearForDeliveryDate,
  resolveDeliveryDate,
} from './delivery-date.util'
import { CreateOrderInput } from './dto/create-order.input'
import { OrderFilterInput } from './dto/order-filter.input'
import { OrderDeliveryMethod } from './order-delivery-method.enum'
import {
  DailyLimitExceededException,
  InvalidOrderQuantityException,
  InvalidOrderStatusTransitionException,
  OrderCannotBeCancelledException,
  OrderNotFoundException,
  OrderNotOwnedException,
  WeeklyLimitExceededException,
} from './exceptions/order.exceptions'
import { OrderLine } from './order-line.entity'
import { OrderEventsService } from './order-events.service'
import { OrderNormalizationService } from './order-normalization.service'
import { OrderStatusHistoryEntry } from './order-status-history.type'
import {
  canAdminCancelOrder,
  canTransitionOrderStatus,
} from './order-status.policy'
import { Order } from './order.entity'
import { OrderStatus } from './order-status.enum'
import {
  DailyVaccineAllowance,
  MyDailyVaccineAllowances,
} from './daily-vaccine-allowance.type'
import { WeeklyOrderSummary } from './weekly-order-summary.type'

type NormalizedLineInput = {
  vaccineId: string
  quantity: number
}

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: MongoRepository<Order>,
    private readonly vaccineService: VaccineService,
    private readonly settingsService: SettingsService,
    private readonly orderEventsService: OrderEventsService,
    private readonly orderNotificationService: OrderNotificationService,
    private readonly businessNotificationProducer: BusinessNotificationProducerService,
    private readonly orderNormalizationService: OrderNormalizationService,
    private readonly stockService: StockService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async requireById(id: string): Promise<Order> {
    if (!ObjectId.isValid(id)) {
      throw new OrderNotFoundException()
    }

    const order = await this.orderRepository.findOne({
      where: { _id: new ObjectId(id) },
    })

    if (!order) {
      throw new OrderNotFoundException()
    }

    return order
  }

  private async requireNormalizedById(id: string): Promise<Order> {
    const order = await this.requireById(id)
    return this.orderNormalizationService.normalizeOrderIfNeeded(order)
  }

  private buildInitialStatusHistoryEntry(
    order: Order,
    changedByUserId: string,
  ): OrderStatusHistoryEntry {
    return {
      fromStatus: null,
      toStatus: OrderStatus.PENDING,
      changedAt: order.submittedAt ?? this.clock.now(),
      changedByUserId,
      reason: null,
    }
  }

  private appendStatusHistory(
    order: Order,
    fromStatus: OrderStatus,
    toStatus: OrderStatus,
    changedByUserId: string,
    reason?: string | null,
  ): void {
    if (!Array.isArray(order.statusHistory)) {
      order.statusHistory = []
    }

    order.statusHistory.push({
      fromStatus,
      toStatus,
      changedAt: this.clock.now(),
      changedByUserId,
      reason: reason ?? null,
    })
  }

  private isDeliveryAlreadyProcessed(order: Order): boolean {
    return (
      order.status === OrderStatus.DELIVERED &&
      order.stockDecrementedAt !== null &&
      order.stockDecrementedAt !== undefined
    )
  }

  private normalizeLines(
    lines: CreateOrderInput['lines'],
  ): NormalizedLineInput[] {
    if (!lines.length) {
      throw new InvalidOrderQuantityException()
    }

    const merged = new Map<string, number>()

    for (const line of lines) {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw new InvalidOrderQuantityException()
      }

      merged.set(
        line.vaccineId,
        (merged.get(line.vaccineId) ?? 0) + line.quantity,
      )
    }

    return [...merged.entries()].map(([vaccineId, quantity]) => ({
      vaccineId,
      quantity,
    }))
  }

  private async loadActiveVaccines(
    normalizedLines: NormalizedLineInput[],
  ): Promise<Map<string, Vaccine>> {
    const vaccines = new Map<string, Vaccine>()

    for (const line of normalizedLines) {
      if (!ObjectId.isValid(line.vaccineId)) {
        throw new VaccineNotFoundException()
      }

      const vaccine = await this.vaccineService.findVaccineEntityById(
        line.vaccineId,
      )

      if (!vaccine.active) {
        throw new VaccineInactiveException()
      }

      vaccines.set(line.vaccineId, vaccine)
    }

    return vaccines
  }

  private getActiveWeeklyQuantity(
    orders: Order[],
    isoYear: number,
    isoWeek: number,
  ): number {
    return orders
      .filter(
        order =>
          order.isoYear === isoYear &&
          order.isoWeek === isoWeek &&
          order.status !== OrderStatus.CANCELLED,
      )
      .reduce((total, order) => total + order.totalQuantity, 0)
  }

  private getDailyQuantityByVaccine(
    orders: Order[],
    deliveryDate: string,
  ): Map<string, number> {
    const totals = new Map<string, number>()

    for (const order of orders) {
      if (
        order.deliveryDate !== deliveryDate ||
        order.status === OrderStatus.CANCELLED
      ) {
        continue
      }

      for (const line of order.orderLines) {
        totals.set(
          line.vaccineId,
          (totals.get(line.vaccineId) ?? 0) + line.quantity,
        )
      }
    }

    return totals
  }

  private async findOrdersForApotheker(apothekerId: string): Promise<Order[]> {
    const orders = await this.orderRepository.find({
      where: { apothekerId },
      order: { submittedAt: 'DESC' },
    })

    return this.orderNormalizationService.normalizeOrdersIfNeeded(orders)
  }

  private buildWeeklySummary(
    orderedQuantity: number,
    isoYear: number,
    isoWeek: number,
    settings: ApplicationSettings,
  ): WeeklyOrderSummary {
    const weeklyLimit = settings.weeklyDoseCap
    const percentageUsed = Math.min(
      100,
      Math.round((orderedQuantity / weeklyLimit) * 100),
    )

    return {
      isoYear,
      isoWeek,
      orderedQuantity,
      weeklyLimit,
      percentageUsed,
      warningReached: percentageUsed >= settings.weeklyWarningPercentage,
      remainingQuantity: Math.max(weeklyLimit - orderedQuantity, 0),
    }
  }

  private buildStatusCounts(orders: Order[]): AdminOrderStatusCount[] {
    const counts = new Map<OrderStatus, number>()

    for (const status of Object.values(OrderStatus)) {
      counts.set(status, 0)
    }

    for (const order of orders) {
      counts.set(order.status, (counts.get(order.status) ?? 0) + 1)
    }

    return [...counts.entries()].map(([status, count]) => ({ status, count }))
  }

  private buildVaccineQuantities(
    orders: Order[],
    includeCancelled: boolean,
  ): AdminDailyVaccineQuantity[] {
    const totals = new Map<string, AdminDailyVaccineQuantity>()

    for (const order of orders) {
      if (!includeCancelled && order.status === OrderStatus.CANCELLED) {
        continue
      }

      for (const line of order.orderLines) {
        const existing = totals.get(line.vaccineId)

        if (existing) {
          existing.quantity += line.quantity
        } else {
          totals.set(line.vaccineId, {
            vaccineId: line.vaccineId,
            vaccineName: line.vaccineName,
            quantity: line.quantity,
          })
        }
      }
    }

    return [...totals.values()]
  }

  async createOrder(user: User, input: CreateOrderInput): Promise<Order> {
    if (user.role !== UserRole.APOTHEKER) {
      throw new OrderNotFoundException()
    }

    const settings = await this.settingsService.getApplicationSettings()
    const submittedAt = this.clock.now()
    const deliveryDate = resolveDeliveryDate(
      submittedAt,
      settings.timezone,
      settings.orderingClosingTime,
    )
    const { isoWeek, isoYear } = getIsoWeekYearForDeliveryDate(deliveryDate)

    const normalizedLines = this.normalizeLines(input.lines)
    const vaccines = await this.loadActiveVaccines(normalizedLines)

    const existingOrders = await this.findOrdersForApotheker(user._id)
    const currentWeeklyQuantity = this.getActiveWeeklyQuantity(
      existingOrders,
      isoYear,
      isoWeek,
    )
    const totalQuantity = normalizedLines.reduce(
      (sum, line) => sum + line.quantity,
      0,
    )

    if (currentWeeklyQuantity + totalQuantity > settings.weeklyDoseCap) {
      throw new WeeklyLimitExceededException(settings.weeklyDoseCap)
    }

    const dailyTotals = this.getDailyQuantityByVaccine(
      existingOrders,
      deliveryDate,
    )

    for (const line of normalizedLines) {
      const vaccine = vaccines.get(line.vaccineId)!
      const currentDaily = dailyTotals.get(line.vaccineId) ?? 0

      if (currentDaily + line.quantity > settings.dailyDoseCapPerType) {
        const remainingToday = Math.max(
          settings.dailyDoseCapPerType - currentDaily,
          0,
        )
        throw new DailyLimitExceededException({
          vaccineId: line.vaccineId,
          vaccineName: vaccine.name,
          dailyMaximum: settings.dailyDoseCapPerType,
          alreadyOrderedToday: currentDaily,
          remainingToday,
          requestedQuantity: line.quantity,
        })
      }
    }

    const orderLines: OrderLine[] = normalizedLines.map(line => {
      const vaccine = vaccines.get(line.vaccineId)!

      return {
        vaccineId: line.vaccineId,
        vaccineName: vaccine.name,
        manufacturer: vaccine.manufacturer,
        quantity: line.quantity,
      }
    })

    const order = this.orderRepository.create({
      apothekerId: user._id,
      status: OrderStatus.PENDING,
      orderLines,
      totalQuantity,
      isoWeek,
      isoYear,
      submittedAt,
      deliveryDate,
      cancelledAt: null,
      stockDecrementedAt: null,
      statusHistory: [
        {
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          changedAt: submittedAt,
          changedByUserId: user._id.toString(),
          reason: null,
        },
      ],
    })

    const saved = await this.orderRepository.save(order)
    await this.orderEventsService.publishOrderCreated(saved)
    await this.orderNotificationService.handleOrderCreated(
      user,
      saved,
      currentWeeklyQuantity,
      settings,
    )
    await this.businessNotificationProducer.notifyAdminsNewOrder(saved)

    return saved
  }

  async findMyOrders(
    user: User,
    isoYear?: number,
    isoWeek?: number,
  ): Promise<Order[]> {
    const orders = await this.findOrdersForApotheker(user._id)

    return orders.filter(order => {
      if (isoYear !== undefined && order.isoYear !== isoYear) {
        return false
      }

      if (isoWeek !== undefined && order.isoWeek !== isoWeek) {
        return false
      }

      return true
    })
  }

  async findMyOrder(user: User, id: string): Promise<Order> {
    const order = await this.requireNormalizedById(id)

    if (order.apothekerId.toString() !== user._id.toString()) {
      throw new OrderNotOwnedException()
    }

    return order
  }

  async findMyWeeklyOrderSummary(
    user: User,
    isoYear?: number,
    isoWeek?: number,
  ): Promise<WeeklyOrderSummary> {
    const settings = await this.settingsService.getApplicationSettings()
    const now = this.clock.now()
    const resolvedWeek = getIsoWeekYear(now, settings.timezone)
    const targetIsoYear = isoYear ?? resolvedWeek.isoYear
    const targetIsoWeek = isoWeek ?? resolvedWeek.isoWeek
    const orders = await this.findOrdersForApotheker(user._id)
    const orderedQuantity = this.getActiveWeeklyQuantity(
      orders,
      targetIsoYear,
      targetIsoWeek,
    )

    return this.buildWeeklySummary(
      orderedQuantity,
      targetIsoYear,
      targetIsoWeek,
      settings,
    )
  }

  async findMyDailyVaccineAllowances(
    user: User,
  ): Promise<MyDailyVaccineAllowances> {
    if (user.role !== UserRole.APOTHEKER) {
      throw new OrderNotFoundException()
    }

    const settings = await this.settingsService.getApplicationSettings()
    const now = this.clock.now()
    const deliveryDate = resolveDeliveryDate(
      now,
      settings.timezone,
      settings.orderingClosingTime,
    )
    const [orders, vaccines] = await Promise.all([
      this.findOrdersForApotheker(user._id),
      this.vaccineService.findVaccines(false, UserRole.APOTHEKER),
    ])
    const dailyTotals = this.getDailyQuantityByVaccine(orders, deliveryDate)
    const dailyMaximum = settings.dailyDoseCapPerType

    const allowances: DailyVaccineAllowance[] = vaccines.map(vaccine => {
      const vaccineId = vaccine._id.toString()
      const orderedToday = dailyTotals.get(vaccineId) ?? 0

      return {
        vaccineId,
        vaccineName: vaccine.name,
        dailyMaximum,
        orderedToday,
        remainingToday: Math.max(dailyMaximum - orderedToday, 0),
      }
    })

    return { deliveryDate, allowances }
  }

  async cancelOwnOrder(user: User, id: string): Promise<Order> {
    const order = await this.findMyOrder(user, id)

    if (order.status === OrderStatus.CANCELLED) {
      return order
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new OrderCannotBeCancelledException()
    }

    const previousStatus = order.status
    order.status = OrderStatus.CANCELLED
    order.cancelledAt = this.clock.now()
    this.appendStatusHistory(
      order,
      previousStatus,
      OrderStatus.CANCELLED,
      user._id.toString(),
    )

    const saved = await this.orderRepository.save(order)
    await this.orderEventsService.publishOrderStatusChanged(saved)
    await this.orderNotificationService.createOrderCancelledNotification(
      user,
      saved,
    )

    return saved
  }

  async findOrders(filter?: OrderFilterInput): Promise<Order[]> {
    const where: Record<string, unknown> = {}

    if (filter?.isoYear !== undefined) {
      where.isoYear = filter.isoYear
    }

    if (filter?.isoWeek !== undefined) {
      where.isoWeek = filter.isoWeek
    }

    if (filter?.status !== undefined) {
      where.status = filter.status
    }

    if (filter?.deliveryDate !== undefined) {
      where.deliveryDate = filter.deliveryDate
    }

    if (filter?.apothekerId !== undefined) {
      if (!ObjectId.isValid(filter.apothekerId)) {
        return []
      }

      where.apothekerId = filter.apothekerId
    }

    const orders = await this.orderRepository.find({
      where,
      order: { submittedAt: 'DESC' },
    })

    return this.orderNormalizationService.normalizeOrdersIfNeeded(orders)
  }

  async findOrderById(id: string): Promise<Order> {
    return this.requireNormalizedById(id)
  }

  async updateOrderStatus(
    admin: User,
    id: string,
    targetStatus: OrderStatus,
    reason?: string | null,
  ): Promise<Order> {
    const order = await this.requireNormalizedById(id)

    if (order.status === targetStatus) {
      if (
        targetStatus === OrderStatus.DELIVERED &&
        !this.isDeliveryAlreadyProcessed(order)
      ) {
        // Legacy DELIVERED records may lack stockDecrementedAt — allow one delivery attempt.
      } else {
        return order
      }
    }

    if (
      order.status !== targetStatus &&
      !canTransitionOrderStatus(order.status, targetStatus)
    ) {
      throw new InvalidOrderStatusTransitionException(
        order.status,
        targetStatus,
      )
    }

    if (targetStatus === OrderStatus.DELIVERED) {
      if (this.isDeliveryAlreadyProcessed(order)) {
        return order
      }

      const decrementResult = await this.stockService.applyDeliveryDecrement(
        admin,
        order.id,
        order.orderLines,
      )

      const previousStatus = order.status
      const wasAlreadyDelivered = previousStatus === OrderStatus.DELIVERED
      order.status = OrderStatus.DELIVERED

      if (!decrementResult.alreadyProcessed) {
        order.stockDecrementedAt = this.clock.now()
      } else if (!order.stockDecrementedAt) {
        order.stockDecrementedAt = this.clock.now()
      }

      if (!wasAlreadyDelivered) {
        const deliveredAt = this.clock.now()
        order.deliveredAt = deliveredAt
        order.deliveredByUserId = admin._id.toString()
        order.deliveryMethod = OrderDeliveryMethod.ADMIN
        // ADMIN path never sets deliveryConfirmationEventId (QR provenance).
        this.appendStatusHistory(
          order,
          previousStatus,
          OrderStatus.DELIVERED,
          admin._id.toString(),
          reason,
        )
      }

      const saved = await this.orderRepository.save(order)

      if (!decrementResult.alreadyProcessed) {
        await this.orderNotificationService.createOrderDeliveredNotification(
          saved,
        )
        await this.orderEventsService.publishOrderStatusChanged(saved)
      }

      return saved
    }

    const previousStatus = order.status
    order.status = targetStatus
    this.appendStatusHistory(
      order,
      previousStatus,
      targetStatus,
      admin._id.toString(),
      reason,
    )

    const saved = await this.orderRepository.save(order)
    await this.orderEventsService.publishOrderStatusChanged(saved)

    return saved
  }

  /**
   * Qualifying orders for route generation.
   *
   * Orders persist `apothekerId` as MongoDB ObjectId (`user._id` on create).
   * ApothekerProfile stores `userId` as a string. GraphQL/profile IDs therefore
   * arrive as strings and must be converted before querying.
   */
  async findQualifyingOrdersForRoute(params: {
    apothekerUserId: string
    deliveryDate: string
  }): Promise<Order[]> {
    const parsed = tryParseGraphqlObjectId(params.apothekerUserId)

    if (!parsed) {
      return []
    }

    try {
      const [byObjectId, byString] = await Promise.all([
        this.orderRepository.find({
          where: {
            apothekerId: parsed.objectId as unknown as string,
            deliveryDate: params.deliveryDate,
          },
        }),
        this.orderRepository.find({
          where: {
            apothekerId: parsed.stringValue,
            deliveryDate: params.deliveryDate,
          },
        }),
      ])

      const unique = new Map<string, Order>()

      for (const order of [...byObjectId, ...byString]) {
        unique.set(order.id.toString(), order)
      }

      const qualifying = [...unique.values()].filter(
        order =>
          order.status === OrderStatus.PENDING ||
          order.status === OrderStatus.PLANNED,
      )

      return this.orderNormalizationService.normalizeOrdersIfNeeded(qualifying)
    } catch {
      return []
    }
  }

  /** @deprecated Use findQualifyingOrdersForRoute — kept for call-site migration. */
  async findQualifyingOrdersForPharmacist(
    apothekerUserId: string,
    deliveryDate: string,
  ): Promise<Order[]> {
    return this.findQualifyingOrdersForRoute({
      apothekerUserId,
      deliveryDate,
    })
  }

  /**
   * Persists PENDING → PLANNED for route generation without publishing realtime
   * events. Callers must publish orderUpdated only after DeliveryRoute upsert.
   */
  async planOrdersForGeneratedRoute(
    admin: User,
    orderIds: string[],
  ): Promise<Order[]> {
    const changedOrders: Order[] = []
    const uniqueIds = [...new Set(orderIds)]

    for (const orderId of uniqueIds) {
      const order = await this.requireNormalizedById(orderId)

      if (order.status === OrderStatus.PLANNED) {
        continue
      }

      if (!canTransitionOrderStatus(order.status, OrderStatus.PLANNED)) {
        throw new InvalidOrderStatusTransitionException(
          order.status,
          OrderStatus.PLANNED,
        )
      }

      const previousStatus = order.status
      order.status = OrderStatus.PLANNED
      this.appendStatusHistory(
        order,
        previousStatus,
        OrderStatus.PLANNED,
        admin._id.toString(),
        'Included in generated delivery route',
      )

      const saved = await this.orderRepository.save(order)
      changedOrders.push(saved)
    }

    return changedOrders
  }

  async publishPlannedOrderUpdates(orders: Order[]): Promise<void> {
    for (const order of orders) {
      await this.orderEventsService.publishOrderStatusChanged(order)
    }
  }

  /**
   * Marks stop orders DELIVERED for QR confirmation (Phase 26D).
   *
   * Idempotent for the same `confirmationEventId`: already-DELIVERED orders that
   * carry this event id are returned as completed without re-decrementing stock.
   * Unrelated DELIVERED orders (ADMIN / other event / legacy) throw.
   *
   * Does **not** emit PubSub or create delivered notifications — the confirm
   * service publishes only after stop finalisation.
   */
  async markDeliveredForQrConfirmation(
    actor: User,
    orderIds: readonly string[],
    confirmationEventId: string,
  ): Promise<Order[]> {
    const savedOrders: Order[] = []
    const uniqueIds = [...new Set(orderIds.map(String))]
    const courierUserId = actor._id.toString()

    for (const orderId of uniqueIds) {
      const order = await this.requireNormalizedById(orderId)

      if (
        order.status === OrderStatus.DELIVERED &&
        order.deliveryConfirmationEventId === confirmationEventId
      ) {
        savedOrders.push(order)
        continue
      }

      if (order.status === OrderStatus.DELIVERED) {
        throw new InvalidOrderStatusTransitionException(
          order.status,
          OrderStatus.DELIVERED,
        )
      }

      if (!canTransitionOrderStatus(order.status, OrderStatus.DELIVERED)) {
        throw new InvalidOrderStatusTransitionException(
          order.status,
          OrderStatus.DELIVERED,
        )
      }

      if (
        order.status !== OrderStatus.PENDING &&
        order.status !== OrderStatus.PLANNED
      ) {
        throw new InvalidOrderStatusTransitionException(
          order.status,
          OrderStatus.DELIVERED,
        )
      }

      const decrementResult = await this.stockService.applyDeliveryDecrement(
        actor,
        order.id,
        order.orderLines,
      )

      const previousStatus = order.status
      const deliveredAt = this.clock.now()
      order.status = OrderStatus.DELIVERED
      order.deliveredAt = deliveredAt
      order.deliveredByUserId = courierUserId
      order.deliveryMethod = OrderDeliveryMethod.QR
      order.deliveryConfirmationEventId = confirmationEventId

      if (!decrementResult.alreadyProcessed) {
        order.stockDecrementedAt = deliveredAt
      } else if (!order.stockDecrementedAt) {
        order.stockDecrementedAt = deliveredAt
      }

      this.appendStatusHistory(
        order,
        previousStatus,
        OrderStatus.DELIVERED,
        courierUserId,
        'Confirmed delivered via QR',
      )

      const saved = await this.orderRepository.save(order)
      savedOrders.push(saved)
    }

    return savedOrders
  }

  /** PubSub fan-out for orders delivered by QR confirm (after stop finalisation). */
  async publishQrDeliveredOrderUpdates(orders: Order[]): Promise<void> {
    for (const order of orders) {
      await this.orderEventsService.publishOrderStatusChanged(order)
    }
  }

  async cancelOrder(
    admin: User,
    id: string,
    reason?: string | null,
  ): Promise<Order> {
    const order = await this.requireNormalizedById(id)

    if (order.status === OrderStatus.CANCELLED) {
      return order
    }

    if (!canAdminCancelOrder(order.status)) {
      throw new OrderCannotBeCancelledException()
    }

    const previousStatus = order.status
    order.status = OrderStatus.CANCELLED
    order.cancelledAt = this.clock.now()
    this.appendStatusHistory(
      order,
      previousStatus,
      OrderStatus.CANCELLED,
      admin._id.toString(),
      reason,
    )

    const saved = await this.orderRepository.save(order)
    await this.orderEventsService.publishOrderStatusChanged(saved)
    await this.orderNotificationService.createAdminCancelledOrderNotification(
      saved,
    )

    return saved
  }

  async getAdminDailyOrderOverview(
    deliveryDate: string,
  ): Promise<AdminDailyOrderOverview> {
    const orders = await this.findOrders({ deliveryDate })
    const activeOrders = orders.filter(
      order => order.status !== OrderStatus.CANCELLED,
    )
    const cancelledOrders = orders.filter(
      order => order.status === OrderStatus.CANCELLED,
    )

    const pharmacistMap = new Map<string, AdminDailyPharmacistSummary>()

    for (const order of activeOrders) {
      const apothekerId = order.apothekerId.toString()
      const existing = pharmacistMap.get(apothekerId)

      if (existing) {
        existing.orderCount += 1
        existing.totalDoses += order.totalQuantity
      } else {
        pharmacistMap.set(apothekerId, {
          apothekerId,
          orderCount: 1,
          totalDoses: order.totalQuantity,
        })
      }
    }

    return {
      deliveryDate,
      totalOrders: activeOrders.length,
      totalDoses: activeOrders.reduce(
        (sum, order) => sum + order.totalQuantity,
        0,
      ),
      cancelledOrderCount: cancelledOrders.length,
      cancelledDoseCount: cancelledOrders.reduce(
        (sum, order) => sum + order.totalQuantity,
        0,
      ),
      statusCounts: this.buildStatusCounts(orders),
      pharmacistSummaries: [...pharmacistMap.values()],
      vaccineQuantities: this.buildVaccineQuantities(activeOrders, true),
    }
  }

  async getAdminWeeklyStatistics(
    isoYear: number,
    isoWeek: number,
  ): Promise<AdminWeeklyStatistics> {
    const orders = await this.findOrders({ isoYear, isoWeek })
    const activeOrders = orders.filter(
      order => order.status !== OrderStatus.CANCELLED,
    )
    const cancelledOrders = orders.filter(
      order => order.status === OrderStatus.CANCELLED,
    )

    return {
      isoYear,
      isoWeek,
      totalOrders: activeOrders.length,
      totalDoses: activeOrders.reduce(
        (sum, order) => sum + order.totalQuantity,
        0,
      ),
      cancelledOrderCount: cancelledOrders.length,
      cancelledDoseCount: cancelledOrders.reduce(
        (sum, order) => sum + order.totalQuantity,
        0,
      ),
      statusCounts: this.buildStatusCounts(orders),
      vaccineQuantities: this.buildVaccineQuantities(activeOrders, true),
    }
  }
}
