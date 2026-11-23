import type { ReactNode } from 'react'

export interface LiveFigure {
  label: ReactNode
  /** Usually a MoneyText or LitresText; give it null before there is input so it reads "—". */
  value: ReactNode
  /** The figure the user is working towards, e.g. the total or the new balance. */
  isResult?: boolean
}

interface Props {
  figures: LiveFigure[]
  /** Read out as the list's name, e.g. "After this payment". */
  label?: string
  className?: string
}

/** The figures a form works out as the user types: litres × rate, totals, the balance after a payment. */
export function LiveFigures({ figures, label, className = '' }: Props) {
  return (
    <dl aria-label={label} className={`ui-live-figures ${className}`}>
      {figures.map((figure, index) => (
        <div key={index} className={`ui-live-figures__row ${figure.isResult ? 'ui-live-figures__row--result' : ''}`}>
          <dt>{figure.label}</dt>
          <dd>{figure.value}</dd>
        </div>
      ))}
    </dl>
  )
}
