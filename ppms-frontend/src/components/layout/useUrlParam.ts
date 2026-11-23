import { useSearchParams } from 'react-router-dom'

/**
 * One search parameter as open/closed state, e.g. ?action=open-shift or ?panel=credit.
 * Setting it adds a history entry, so the phone's Back button closes what it opened; removing it replaces the entry.
 */
export function useUrlParam(name: string) {
  const [searchParams, setSearchParams] = useSearchParams()

  const set = (value: string) => setSearchParams((params) => {
    const updated = new URLSearchParams(params)
    updated.set(name, value)
    return updated
  })

  const remove = () => setSearchParams((params) => {
    const updated = new URLSearchParams(params)
    updated.delete(name)
    return updated
  }, { replace: true })

  return { value: searchParams.get(name), set, remove }
}
