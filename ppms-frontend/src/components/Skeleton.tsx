/**
 * Skeleton loading placeholders — drop these in place of real content
 * while data is being fetched. Uses the .ui-skeleton shimmer class.
 *
 * Available components:
 *  - SkeletonStat     : matches .ui-dashboard-stat card shape
 *  - SkeletonTable    : matches .ui-table-wrap table shape
 *  - SkeletonRows     : matches .ui-record-list row shape
 */

export function SkeletonStat() {
  return (
    <div className="ui-dashboard-stat">
      <div className="flex items-center justify-between mb-4">
        <span className="ui-skeleton" style={{ height: 11, width: 90 }} />
        <span className="ui-skeleton ui-skeleton--circle" style={{ width: 40, height: 40 }} />
      </div>
      <span className="ui-skeleton" style={{ height: 34, width: '48%', marginBottom: '0.45rem' }} />
      <span className="ui-skeleton" style={{ height: 11, width: '66%' }} />
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="ui-table-wrap">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} style={{ padding: '0.8rem 1rem', textAlign: 'left' }}>
                <span className="ui-skeleton" style={{ height: 10, width: '52%' }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} style={{ borderTop: '1px solid #edf2f7' }}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} style={{ padding: '0.8rem 1rem' }}>
                  <span
                    className="ui-skeleton"
                    style={{ height: 14, width: c === 0 ? '72%' : `${40 + c * 13}%` }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="ui-record-list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="ui-record-row">
          <div className="ui-record-row__main" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <span className="ui-skeleton" style={{ height: 14, width: '52%' }} />
            <span className="ui-skeleton" style={{ height: 11, width: '34%' }} />
          </div>
          <span className="ui-skeleton" style={{ height: 32, width: 72, borderRadius: 10 }} />
        </div>
      ))}
    </div>
  )
}
