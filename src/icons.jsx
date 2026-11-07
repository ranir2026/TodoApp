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
