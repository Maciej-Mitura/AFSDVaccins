export const initializeApp = jest.fn()
export const applicationDefault = jest.fn(() => ({
  mock: 'applicationDefault',
}))
export const cert = jest.fn((input: unknown) => ({
  mock: 'cert',
  input,
}))

export type App = {
  name?: string
}

export type Credential = {
  mock?: string
}
