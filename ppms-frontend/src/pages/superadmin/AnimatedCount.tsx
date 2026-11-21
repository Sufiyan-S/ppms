import { useCountUp } from '../../hooks/useCountUp'

// ── Small helper components ───────────────────────────────────────────────────

// ── Animated counter — wraps useCountUp so it can be called inside a component
// boundary rather than directly inside a conditional render.
export function AnimatedCount({ value }: { value: number }) {
  const animated = useCountUp(value)
  return <>{animated}</>
}
