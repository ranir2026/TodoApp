// The app's logo: the paper trail mark from public/icon.png (the same image as the tab icon)
export default function BrandMark({ size = 56, className = "" }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icon.png`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={`brand-mark ${className}`}
      style={{ "--mark-size": `${size}px` }}
    />
  );
}
