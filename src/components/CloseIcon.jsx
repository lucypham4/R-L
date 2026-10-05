// The ×, drawn once for everywhere the app closes, clears or removes
// something, in the design system's icon style (24 grid, 1.6 line, round
// ends). It used to be the multiplication sign of whichever font the page
// was set in, so its weight, size and height shifted with the face and the
// platform; a drawing stays put, and takes its colour from the text around
// it, like the other icons.
//
// Decorative unless it's given a label: usually the button around it is
// what's named, and the icon is only what that button looks like.
export default function CloseIcon({ size = 16, label, className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' })}
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
