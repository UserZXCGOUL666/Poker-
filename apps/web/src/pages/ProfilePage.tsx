import { Award, CalendarCheck, CheckCircle2, ChevronRight, Phone, ShieldCheck, Spade, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { ErrorState, Loading } from '../components/Loading';
import { api } from '../lib/api';
import { points, tournamentDate } from '../lib/format';
import type { PointTransaction, Tournament, User } from '../types';

type Profile = User & {
  rank: number;
  createdAt: string;
  results: { id: string; place: number; points: number; tournament: Tournament }[];
  pointTransactions: PointTransaction[];
  hasPhoneNumber: boolean;
  phoneNumberMasked: string | null;
  phoneSharedAt: string | null;
};

export function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phoneMessage, setPhoneMessage] = useState<string | null>(null);
  useEffect(() => { api<Profile>('/profile').then(setProfile).catch((e: Error) => setError(e.message)); }, []);
  if (error) return <ErrorState message={error} />;
  if (!profile) return <Loading />;
  const wins = profile.results.filter((item) => item.place === 1).length;
  function requestPhone() {
    const telegram = window.Telegram?.WebApp;
    if (!telegram?.requestContact) {
      setPhoneMessage('Передать номер можно только внутри Telegram Mini App.');
      return;
    }
    setPhoneMessage(null);
    telegram.requestContact((shared) => {
      if (!shared) { setPhoneMessage('Номер не был передан. Вы сможете сделать это позже.'); return; }
      setPhoneMessage('Контакт отправлен боту. Telegram пришлёт подтверждение после сохранения.');
      window.setTimeout(() => {
        void api<Profile>('/profile').then((next) => { setProfile(next); if (next.hasPhoneNumber) setPhoneMessage('Номер сохранён и виден только администраторам клуба.'); });
      }, 1800);
    });
  }
  return <div className="page profile-page">
    <section className="profile-hero">
      <Avatar firstName={profile.firstName} lastName={profile.lastName} photoUrl={profile.photoUrl} size="lg" />
      <h1>{profile.firstName} {profile.lastName}</h1><p>@{profile.username || 'player'}</p>
      {profile.role === 'ADMIN' && <span className="admin-pill"><ShieldCheck size={14} /> Администратор</span>}
    </section>
    <div className="profile-stats">
      <div><Trophy size={20} /><strong>#{profile.rank}</strong><span>в рейтинге</span></div>
      <div><Spade size={20} /><strong>{points(profile.points)}</strong><span>очков</span></div>
      <div><Award size={20} /><strong>{wins}</strong><span>побед</span></div>
    </div>
    <div className="telegram-id card"><span>Ваш Telegram ID</span><code>{profile.telegramId}</code></div>
    <section className={`phone-share-card card ${profile.hasPhoneNumber ? 'saved' : ''}`}><span>{profile.hasPhoneNumber ? <CheckCircle2 /> : <Phone />}</span><div><strong>{profile.hasPhoneNumber ? 'Номер передан' : 'Оставить номер организаторам'}</strong><small>{profile.hasPhoneNumber ? `${profile.phoneNumberMasked} · доступен только администраторам` : 'Добровольно — для связи по турнирам и подаркам'}</small></div>{!profile.hasPhoneNumber && <button onClick={requestPhone}>Поделиться</button>}</section>
    {phoneMessage && <div className="phone-share-message">{phoneMessage}</div>}
    {profile.role === 'ADMIN' && <Link className="admin-entry card" to="/admin"><span><ShieldCheck /><span><strong>Управление клубом</strong><small>Турниры, результаты и сезоны</small></span></span><ChevronRight /></Link>}
    <div className="section-title"><h2>История очков</h2></div>
    <div className="points-history card">
      {profile.pointTransactions.map((entry) => <div className="point-history-row" key={entry.id}>
        <span className={entry.amount > 0 ? 'point-plus' : 'point-minus'}>{entry.amount > 0 ? '+' : ''}{points(entry.amount)}</span>
        <div><strong>{entry.reason}</strong><span>{tournamentDate(entry.createdAt).full} · {entry.createdBy.firstName}</span></div>
        <small>{points(entry.balanceAfter)} PTS</small>
      </div>)}
      {!profile.pointTransactions.length && <div className="empty-inline">Начислений в этом сезоне пока нет</div>}
    </div>
    <div className="section-title"><h2>Последние игры</h2></div>
    <div className="history-list card">
      {profile.results.map((result) => <div className="history-row" key={result.id}>
        <span className="history-icon"><CalendarCheck size={19} /></span>
        <div><strong>{result.tournament.title}</strong><span>{tournamentDate(result.tournament.startsAt).full}</span></div>
        <div><strong>#{result.place}</strong><span>место</span></div>
      </div>)}
      {!profile.results.length && <div className="empty-inline">История игр пока пуста</div>}
    </div>
    <section className="rules-card card"><h2>Как начисляются очки</h2><p>Очки выдаются администратором клуба вручную. Каждое начисление и списание сохраняется в истории вместе с причиной, датой и итоговым балансом.</p></section>
  </div>;
}
