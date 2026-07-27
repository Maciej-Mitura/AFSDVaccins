import { HttpException } from '@nestjs/common'

import { formatGraphqlHttpException } from './format-http-exception'

describe('formatGraphqlHttpException', () => {
  it('promotes Nest HttpException domain error codes into extensions.code', () => {
    const httpError = new HttpException(
      {
        message: 'Duplicate active templates',
        error: 'ROUTE_TEMPLATE_MULTIPLE_ACTIVE_FOR_COURIER',
      },
      409,
    )

    const formatted = formatGraphqlHttpException(
      {
        message: 'Duplicate active templates',
        extensions: { code: 'INTERNAL_SERVER_ERROR' },
      },
      { originalError: httpError },
    )

    expect(formatted.extensions?.code).toBe(
      'ROUTE_TEMPLATE_MULTIPLE_ACTIVE_FOR_COURIER',
    )
    expect(formatted.extensions?.originalError).toEqual({
      error: 'ROUTE_TEMPLATE_MULTIPLE_ACTIVE_FOR_COURIER',
      message: 'Duplicate active templates',
    })
  })

  it('leaves non-HttpException errors unchanged', () => {
    const input = {
      message: 'boom',
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    }
    expect(formatGraphqlHttpException(input, new Error('boom'))).toEqual(input)
  })
})
