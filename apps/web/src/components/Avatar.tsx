import { initials } from '../lib/format';

export function Avatar({ firstName, lastName, photoUrl, size = 'md' }: { firstName: string; lastName?: string | null; photoUrl?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  return photoUrl
    ? <img className={`avatar avatar-${size}`} src={photoUrl} alt="" />
    : <span className={`avatar avatar-${size}`}>{initials(firstName, lastName)}</span>;
}
