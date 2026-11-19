// The app's mark: the checkbox every task has, ticked, on a tile in the app's accent
export default function BrandMark({ size = 56, className = "" }) {
  return (
    <span aria-hidden="true" className={`brand-mark ${className}`} style={{ "--mark-size": `${size}px` }}>
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" />
        <path d="M8.6 12.4l2.3 2.3 4.6-5.1" />
      </svg>
    </span>
  );
}
