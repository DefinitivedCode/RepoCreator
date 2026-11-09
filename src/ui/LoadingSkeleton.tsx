export function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div className="ui-loading-skeleton" role="status">
      <span className="ui-visually-hidden">{label}</span>
      <div aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
