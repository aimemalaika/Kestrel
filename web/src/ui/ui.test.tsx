import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  Icon,
  ICON_NAMES,
  StatusBadge,
  SeverityBadge,
  RoleBadge,
  ViewHeader,
  MiniBar,
  EmptyState,
  PrimaryBtn,
  Table,
  TR,
  TD,
  FilterBar,
} from '.'

describe('ui primitives', () => {
  it('Icon renders a glyph by name and nothing for unknown names', () => {
    const { container, rerender } = render(<Icon name="pod" />)
    expect(container.querySelector('svg')!.children.length).toBeGreaterThan(0)
    rerender(<Icon name="nope" />)
    expect(container.querySelector('svg')!.children.length).toBe(0)
    expect(ICON_NAMES.length).toBe(59)
  })

  it('StatusBadge maps known statuses and falls back for unknown', () => {
    render(
      <>
        <StatusBadge status="Running" />
        <StatusBadge status="CrashLoopBackOff" />
        <StatusBadge status="Weird" />
      </>,
    )
    expect(screen.getByText('Running').className).toContain('text-emerald-400')
    expect(screen.getByText('CrashLoopBackOff').className).toContain('text-red-400')
    expect(screen.getByText('Weird').className).toContain('text-zinc-400')
  })

  it('Severity and Role badges render', () => {
    render(
      <>
        <SeverityBadge sev="critical" />
        <RoleBadge role="worker" />
      </>,
    )
    expect(screen.getByText('critical').className).toContain('text-red-400')
    expect(screen.getByText('worker').className).toContain('text-sky-400')
  })

  it('ViewHeader renders title, count and tab clicks', () => {
    const onTab = vi.fn()
    render(
      <ViewHeader title="Pods" count={3} tabs={['All', 'Failed']} activeTab="All" onTab={onTab} />,
    )
    expect(screen.getByRole('heading', { name: 'Pods' })).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Failed' }))
    expect(onTab).toHaveBeenCalledWith('Failed')
  })

  it('MiniBar clamps value', () => {
    render(<MiniBar value={150} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('buttons default to type=button and fire onClick', () => {
    const onClick = vi.fn()
    render(<PrimaryBtn onClick={onClick}>Go</PrimaryBtn>)
    const b = screen.getByRole('button', { name: 'Go' })
    expect(b).toHaveAttribute('type', 'button')
    fireEvent.click(b)
    expect(onClick).toHaveBeenCalled()
  })

  it('Table renders headers and rows; EmptyState has status role', () => {
    render(
      <>
        <Table headers={['Name']}>
          <TR>
            <TD>web-1</TD>
          </TR>
        </Table>
        <EmptyState title="Nothing here" hint="Try later" />
      </>,
    )
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
    expect(screen.getByText('web-1')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Nothing here')
  })

  it('FilterBar reports query changes', () => {
    const onQuery = vi.fn()
    render(<FilterBar query="" onQuery={onQuery} />)
    fireEvent.change(screen.getByLabelText('Filter by name'), { target: { value: 'x' } })
    expect(onQuery).toHaveBeenCalledWith('x')
  })
})
