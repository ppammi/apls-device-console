type Props = {
  page: number;
  pageSize: number;
  /** pageInfo.total_count; undefined until the first response arrives. */
  total: number | undefined;
  onChange: (page: number) => void;
  label: string;
};

/** The API only gives total_count, so page count and "next" are derived here. */
export function Pager({ page, pageSize, total, onChange, label }: Props) {
  const pageCount = total === undefined ? undefined : Math.max(1, Math.ceil(total / pageSize));
  const hasNext = pageCount !== undefined && page < pageCount;

  return (
    <nav className="pager" aria-label={label}>
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        Previous
      </button>
      <span>
        Page {page}
        {pageCount !== undefined && ` of ${pageCount}`}
      </span>
      <button type="button" onClick={() => onChange(page + 1)} disabled={!hasNext}>
        Next
      </button>
    </nav>
  );
}
