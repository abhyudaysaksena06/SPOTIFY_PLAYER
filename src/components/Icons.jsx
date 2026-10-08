// Simple original line/solid icons on a 24px grid.
const S = ({ size = 16, children, fill }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"
    fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

export const Play = p => <S {...p} fill><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" /></S>
export const Pause = p => <S {...p} fill><rect x="5" y="4" width="5" height="16" rx="1.2" /><rect x="14" y="4" width="5" height="16" rx="1.2" /></S>
export const Next = p => <S {...p} fill><path d="M4 5.2v13.6a1 1 0 0 0 1.55.83L15 13.2V19a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v5.8L5.55 4.37A1 1 0 0 0 4 5.2z" /></S>
export const Prev = p => <S {...p} fill><path d="M20 5.2v13.6a1 1 0 0 1-1.55.83L9 13.2V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5.8l9.45-6.43A1 1 0 0 1 20 5.2z" /></S>
export const Shuffle = p => <S {...p}><path d="M3 6h3.5c1.6 0 3 .8 3.9 2.1l3.2 7.8c.9 1.3 2.3 2.1 3.9 2.1H21M3 18h3.5c1.3 0 2.5-.5 3.3-1.4M14.2 7.4C15 6.5 16.2 6 17.5 6H21M18 3l3 3-3 3M18 15l3 3-3 3" /></S>
export const Repeat = p => <S {...p}><path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4" /></S>
export const Home = p => <S {...p} fill><path d="M11.3 2.6a1 1 0 0 1 1.4 0l8.6 8A1 1 0 0 1 21 12.3V21a1 1 0 0 1-1 1h-5v-6a3 3 0 0 0-6 0v6H4a1 1 0 0 1-1-1v-8.7a1 1 0 0 1 .3-.7l8-8z" /></S>
export const Search = p => <S {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></S>
export const Library = p => <S {...p}><path d="M4 3v18M9 3v18M14 4l6 16" /></S>
export const Volume = p => <S {...p}><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></S>
export const Clock = p => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>
export const Device = p => <S {...p}><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></S>
export const Heart = p => <S {...p} fill><path d="M12 21s-7.5-4.6-9.5-9.3C1 8 3.4 4 7.2 4c2 0 3.5 1 4.8 2.7C13.3 5 14.8 4 16.8 4 20.6 4 23 8 21.5 11.7 19.5 16.4 12 21 12 21z" /></S>
export const Disc = p => <S {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></S>
export const Expand = p => <S {...p}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></S>
export const Collapse = p => <S {...p}><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></S>
export const Speaker = p => <S {...p}><rect x="5" y="2" width="14" height="20" rx="2" /><circle cx="12" cy="14" r="4" /><path d="M12 6h.01" /></S>
export const Lyrics = p => <S {...p}><path d="M4 5h16M4 10h12M4 15h9" /><circle cx="17.5" cy="17.5" r="2.5" /><path d="M20 17.5V11l2 1" /></S>
export const ChevronDown = p => <S {...p}><path d="M6 9l6 6 6-6" /></S>
