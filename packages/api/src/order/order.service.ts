import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { ApplicationSettings } from '../settings/settings.entity'
import { SettingsService } from '../settings/settings.service'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import {
  VaccineInactiveException,
  VaccineNotFoundException,
} from '../vaccine/exceptions/vaccine.exceptions'
import { Vaccine } from '../vaccine/vaccine.entity'
import { VaccineService } from '../vaccine/vaccine.service'
import { CLOCK } from './clock.provider'
import type { Clock } from './clock.provider'
import { CreateOrderInput } from './dto/create-order.input'
import { OrderFilterInput } from './dto/order-filter.input'
import {
  DailyLimitExceededException,
  InvalidOrderQuantityException,
  OrderCannotBeCancelledException,
  OrderNotFoundException,
  OrderNotOwnedException,
  OrderingClosedException,
  WeeklyLimitExceededException,
} from './exceptions/order.exceptions'
import { OrderLine } from './order-line.entity'
import {
  DAILY_DOSE_CAP_PER_TYPE,
  WEEKLY_DOSE_CAP,
} from './order.constants'
import { Order } from './order.entity'
import { OrderStatus } from './order-status.enum'
import {
  getIsoWeekYear,
  isAfterClosingTime,
  resolveDeliveryDate,
} from './ordering-time.util'
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

  private assertOrderingOpen(
    instant: Date,
    settings: ApplicationSettings,
  ): void {
    if (
      isAfterClosingTime(
        instant,
        settings.timezone,
        settings.orderingClosingTime,
      )
    ) {
      throw new OrderingClosedException(settings.orderingClosingTime)
    }
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
    return this.orderRepository.find({
      where: { apothekerId },
      order: { submittedAt: 'DESC' },
    })
  }

  private buildWeeklySummary(
    orderedQuantity: number,
    isoYear: number,
    isoWeek: number,
    weeklyWarningPercentage: number,
  ): WeeklyOrderSummary {
    const weeklyLimit = WEEKLY_DOSE_CAP
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
      warningReached: percentageUsed >= weeklyWarningPercentage,
      remainingQuantity: Math.max(weeklyLimit - orderedQuantity, 0),
    }
  }

  async createOrder(user: User, input: CreateOrderInput): Promise<Order> {
    if (user.role !== UserRole.APOTHEKER) {
      throw new OrderNotFoundException()
    }

    const settings = await this.settingsService.getApplicationSettings()
    const submittedAt = this.clock.now()
    this.assertOrderingOpen(submittedAt, settings)

    const normalizedLines = this.normalizeLines(input.lines)
    const vaccines = await this.loadActiveVaccines(normalizedLines)
    const { isoWeek, isoYear } = getIsoWeekYear(
      submittedAt,
      settings.timezone,
    )
    const deliveryDate = resolveDeliveryDate(
      submittedAt,
      settings.timezone,
      settings.orderingClosingTime,
    )

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

    if (currentWeeklyQuantity + totalQuantity > WEEKLY_DOSE_CAP) {
      throw new WeeklyLimitExceededException(WEEKLY_DOSE_CAP)
    }

    const dailyTotals = this.getDailyQuantityByVaccine(
      existingOrders,
      deliveryDate,
    )

    for (const line of normalizedLines) {
      const vaccine = vaccines.get(line.vaccineId)!
      const currentDaily = dailyTotals.get(line.vaccineId) ?? 0

      if (currentDaily + line.quantity > DAILY_DOSE_CAP_PER_TYPE) {
        throw new DailyLimitExceededException(
          vaccine.name,
          DAILY_DOSE_CAP_PER_TYPE,
        )
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
    })

    return this.orderRepository.save(order)
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
    const order = await this.requireById(id)

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
      settings.weeklyWarningPercentage,
    )
  }

  async cancelOwnOrder(user: User, id: string): Promise<Order> {
    const order = await this.findMyOrder(user, id)

    if (order.status === OrderStatus.CANCELLED) {
      return order
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new OrderCannotBeCancelledException()
    }

    order.status = OrderStatus.CANCELLED
    order.cancelledAt = this.clock.now()

    return this.orderRepository.save(order)
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

    if (filter?.apothekerId !== undefined) {
      if (!ObjectId.isValid(filter.apothekerId)) {
        return []
      }

      where.apothekerId = filter.apothekerId
    }

    return this.orderRepository.find({
      where,
      order: { submittedAt: 'DESC' },
    })
  }

  async findOrderById(id: string): Promise<Order> {
    return this.requireById(id)
  }
}
