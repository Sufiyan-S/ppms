import { cloneElement, isValidElement, useId } from 'react'
import type { ReactElement, ReactNode } from 'react'

interface FieldControlProps {
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

interface FormFieldProps {
  label: ReactNode
  error?: string
  help?: ReactNode
  className?: string
  labelClassName?: string
  /** A single input, select, textarea or input component that forwards id/aria props. */
  children: ReactElement<FieldControlProps>
}

export function FormField({ label, error, help, className, labelClassName = 'ui-label', children }: FormFieldProps) {
  const generatedId = useId()
  const controlId = (isValidElement(children) && children.props.id) || generatedId
  const helpId = help ? `${controlId}-help` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy = [children.props['aria-describedby'], helpId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={className}>
      <label htmlFor={controlId} className={labelClassName}>{label}</label>
      {cloneElement(children, {
        id: controlId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : children.props['aria-invalid'],
      })}
      {help && <p id={helpId} className="ui-help">{help}</p>}
      {error && <p id={errorId} role="alert" className="ui-error-text">{error}</p>}
    </div>
  )
}
