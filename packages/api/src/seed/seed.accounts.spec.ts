import { UserRole } from '../user/user-role.enum'
import { resolveSeedAccounts, SEED_ACCOUNTS } from './seed.accounts'

describe('resolveSeedAccounts', () => {
  it('resolves personal ADMIN email from input and keeps teacher email static', () => {
    const accounts = resolveSeedAccounts({
      personalAdminEmail: 'Owner@Example.COM',
      demoPassword: 'demo',
      teacherPassword: 'teacher',
    })

    expect(SEED_ACCOUNTS).toHaveLength(7)
    expect(accounts.filter(account => account.role === UserRole.ADMIN)).toHaveLength(
      2,
    )

    const personal = accounts.find(account => account.key === 'personalAdmin')
    const teacher = accounts.find(account => account.key === 'docent')

    expect(personal?.email).toBe('owner@example.com')
    expect(personal?.password).toBe('demo')
    expect(teacher?.email).toBe('docent@howest.be')
    expect(teacher?.password).toBe('teacher')
  })
})
