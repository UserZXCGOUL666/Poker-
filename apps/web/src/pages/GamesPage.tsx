import { CalendarDays, Check, Clock3, MapPin, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ErrorState, Loading } from '../components/Loading';
import { api } from '../lib/api';
import { tournamentDate } from '../lib/format';
import type { Tournament, TournamentStatus } from '../types';

const labels: Record<TournamentStatus, string> = { UPCOMING: 'Скоро', ACTIVE: 'Идёт сейчас', FINISHED: 'Завершён', CANCELLED: 'Отменён' };

export function GamesPage() {
  const [items, setItems] = useState<Tournament[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'upcoming' | 'finished'>('upcoming');
  useEffect(() => { api<Tournament[]>('/tournaments').then(setItems).catch((e: Error) => setError(e.message)); }, []);
  const filtered = useMemo(() => items?.filter((item) => filter === 'upcoming' ? ['UPCOMING', 'ACTIVE'].includes(item.status) : item.status === 'FINISHED'), [items, filter]);
  if (error) return <ErrorState message={error} />;
  if (!items) return <Loading />;
  return <div className="page">
    <div className="page-heading"><span className="eyebrow">КАЛЕНДАРЬ КЛУБА</span><h1>Игры</h1><p>Все турниры текущего сезона</p></div>
    <div className="segmented"><button className={filter === 'upcoming' ? 'active' : ''} onClick={() => setFilter('upcoming')}>Предстоящие</button><button className={filter === 'finished' ? 'active' : ''} onClick={() => setFilter('finished')}>Завершённые</button></div>
    <div className="games-list">
      {filtered?.map((game) => {
        const date = tournamentDate(game.startsAt);
        return <article className="game-card card" key={game.id}>
          <div className="game-card-head"><div className="date-tile"><strong>{date.day}</strong><span>{date.month}</span></div><span className={`status status-${game.status.toLowerCase()}`}>{game.status === 'FINISHED' && <Check size={13} />}{labels[game.status]}</span></div>
          <h2>{game.title}</h2><p>{game.description}</p>
          <div className="game-meta"><span><Clock3 size={16} />{date.time}</span><span><Users size={16} />{game.participantCount || game._count?.results || 0}/{game.capacity}</span>{game.location && <span><MapPin size={16} />{game.location}</span>}</div>
        </article>;
      })}
      {!filtered?.length && <div className="empty-card card"><CalendarDays size={28} /><strong>Турниров пока нет</strong><span>Администратор добавит расписание</span></div>}
    </div>
  </div>;
}
