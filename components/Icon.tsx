type Name =
  | "plus" | "folder" | "check" | "download" | "clock" | "arrowRight"
  | "grid" | "list" | "edit" | "mail" | "user" | "help" | "signOut"
  | "book" | "menu" | "close" | "eye" | "eyeOff" | "alert" | "inbox"
  | "ruler" | "beam";

const paths: Record<Name, React.ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  folder: <path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />,
  check: <path d="M20 6 9 17l-5-5" />,
  download: <><path d="M12 3v12" /><path d="m7 12 5 5 5-5" /><path d="M5 21h14" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7" /><path d="M12 17h.01" /></>,
  signOut: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z" /><path d="M8 7h7M8 11h7" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 6.8A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.2-.9" /><path d="m2 2 20 20" /></>,
  alert: <><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>,
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z" /></>,
  // Drafting ruler — the site plan tool. Diagonal scale with graduations.
  ruler: <><path d="M16 3l5 5L8 21l-5-5z" /><path d="m7 12 2 2M10 9l2 2M13 6l2 2" /></>,
  // Structural truss — engineering. Rafters, bottom chord, collar tie.
  beam: <><path d="M3 18h18" /><path d="m12 6-7.2 12M12 6l7.2 12" /><path d="M8.4 12h7.2" /></>,
};

export function Icon({ name, size = 15 }: { name: Name; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
export type IconName = Name;
