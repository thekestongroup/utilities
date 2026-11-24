import { describe, expect, it } from 'vitest'
import { endDateOf, formToQuery, queryToForm } from './formState'

const defaults = { today: '2027-03-14', zone: 'Europe/London' }

describe('form state in the URL', () => {
  it('round-trips a form', () => {
    const form = queryToForm(
      { key: 'JBSWY3DPEHPK3PXP', label: 'Gmail', start: '2027-04-01', end: '2027-07-01', tz: 'America/New_York', algo: 'SHA-256', digits: '8', period: '60', edition: 'day' },
      defaults
    )
    expect(form).toMatchObject({ duration: '3', zone: 'America/New_York', algorithm: 'SHA-256', digits: 8, period: 60, edition: 'day' })
    expect(queryToForm(formToQuery(form), defaults)).toEqual(form)
  })

  it('leaves defaults out of the URL', () => {
    const query = formToQuery(queryToForm({ start: '2027-03-14' }, defaults))
    expect(query).toEqual({ start: '2027-03-01', end: '2027-04-01', tz: 'Europe/London' })
  })

  it('snaps any start date to the 1st of its month, and keeps a whole number of months', () => {
    const form = queryToForm({ start: '2027-03-14', end: '2027-06-14' }, defaults)
    expect(form.start).toBe('2027-03-01')
    expect(form.duration).toBe('1')
    expect(endDateOf(form)).toBe('2027-04-01')
    expect(queryToForm({ start: '2027-03-14', end: '2027-06-01' }, defaults).duration).toBe('3')
  })

  it('ignores bad values', () => {
    const form = queryToForm({ start: 'nope', tz: 'Not/AZone', end: '2020-01-01', digits: '7', algo: 'MD5', period: '0' }, defaults)
    expect(form).toMatchObject({ start: '2027-03-01', zone: 'Europe/London', duration: '1', digits: 6, algorithm: 'SHA-1', period: 30 })
  })
})
