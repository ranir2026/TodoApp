// Small stroke icons shared by the planner. They inherit the text color and take a size class.
function Icon({ className, children }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {children}
    </svg>
  );
}

export function ChevronLeftIcon({ className = "h-4 w-4" }) {
  return <Icon className={className}><path d="M10 4L6 8l4 4" /></Icon>;
}

export function ChevronRightIcon({ className = "h-4 w-4" }) {
  return <Icon className={className}><path d="M6 4l4 4-4 4" /></Icon>;
}

export function CloseIcon({ className = "h-4 w-4" }) {
  return <Icon className={className}><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></Icon>;
}

export function PlusIcon({ className = "h-4 w-4" }) {
  return <Icon className={className}><path d="M8 3.5v9M3.5 8h9" /></Icon>;
}

export function PencilIcon({ className = "h-4 w-4" }) {
  return <Icon className={className}><path d="M10.5 3.5l2 2L6 12l-2.75.75L4 10l6.5-6.5zM9.25 4.75l2 2" /></Icon>;
}

export function CheckIcon({ className = "h-4 w-4" }) {
  return <Icon className={className}><path d="M3.75 8.25l2.75 2.75 5.75-6" /></Icon>;
}

// Canvas is named in words; this school glyph stands beside it. Instructure's logo isn't used:
// its terms don't allow it on third-party products without permission.
export function SchoolIcon({ className = "h-4 w-4" }) {
  return <Icon className={className}><path d="M1.75 6L8 3l6.25 3L8 9 1.75 6z" /><path d="M4.5 7.7v2.8c0 .9 1.6 1.75 3.5 1.75s3.5-.85 3.5-1.75V7.7M14.25 6v3.25" /></Icon>;
}

export function RefreshIcon({ className = "h-4 w-4" }) {
  return <Icon className={className}><path d="M12.6 9.5a4.75 4.75 0 1 1-.9-4.6" /><path d="M12.25 2.5v2.75H9.5" /></Icon>;
}

export function ExternalLinkIcon({ className = "h-4 w-4" }) {
  return <Icon className={className}><path d="M6.5 4H4.25A1.25 1.25 0 0 0 3 5.25v6.5A1.25 1.25 0 0 0 4.25 13h6.5A1.25 1.25 0 0 0 12 11.75V9.5M9 3h4v4M13 3L7.5 8.5" /></Icon>;
}

export function TrashIcon({ className = "h-4 w-4" }) {
  return <Icon className={className}><path d="M3 4.5h10M6.25 4.5V3.25h3.5V4.5M4.5 4.5l.6 8.25h5.8l.6-8.25M6.75 7v3.5M9.25 7v3.5" /></Icon>;
}
