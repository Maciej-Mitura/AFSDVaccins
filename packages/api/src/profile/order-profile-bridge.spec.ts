/**
 * Documents the Phase 11/12 ownership bridge without rewriting orders.
 *
 * RouteTemplateStop.apothekerProfileId
 *   → ApothekerProfile.userId
 *   → Order.apothekerId (User.id)
 */
describe('order–profile ownership bridge', () => {
  it('joins template stop profile to orders via ApothekerProfile.userId', () => {
    const userId = '507f1f77bcf86cd799439011'
    const apothekerProfileId = '607f1f77bcf86cd799439022'

    const profile = {
      id: apothekerProfileId,
      userId,
    }

    const order = {
      id: '707f1f77bcf86cd799439033',
      apothekerId: userId,
    }

    expect(profile.userId).toBe(order.apothekerId)
    expect(profile.userId).not.toBe(apothekerProfileId)
  })
})
