import { CalendarDays, Check, Clock3, ListOrdered, MapPin, UserCheck, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorState, Loading } from '../components/Loading';
import { api, post } from '../lib/api';
import { tournamentDate } from '../lib/format';
import type { Tournament, TournamentStatus } from '../types';

const labels: Record<TournamentStatus, string> = { UPCOMING: 'Скоро', ACTIVE: 'Идёт сейчас', FINISHED: 'Завершён', CANCELLED: 'Отменён' };

export function GamesPage() {
  const [items, setItems] = useState<Tournament[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'upcoming' | 'finished'>('upcoming');
  const load = useCallback(async () => {
    try { setItems(await api<Tournament[]>('/tournaments')); setLoadError(null); }
    catch (cause) { setLoadError(cause instanceof Error ? cause.message : 'Не удалось загрузить турниры'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function register(game: Tournament) {
    setSavingId(game.id); setActionError(null); setNotice(null);
    try {
      const result = await post<{ registration: { status: string } }>(`/tournaments/${game.id}/registration`);
      setNotice(result.registration.status === 'WAITLISTED' ? 'Вы добавлены в лист ожидания' : 'Место на турнире подтверждено');
      await load();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Не удалось записаться'); }
    finally { setSavingId(null); }
  }
  async function cancel(game: Tournament) {
    setSavingId(game.id); setActionError(null); setNotice(null);
    try { await post(`/tournaments/${game.id}/registration`, undefined, 'DELETE'); setNotice('Запись отменена'); await load(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Не удалось отменить запись'); }
    finally { setSavingId(null); }
  }
  const filtered = useMemo(() => items?.filter((item) => filter === 'upcoming' ? ['UPCOMING', 'ACTIVE'].includes(item.status) : item.status === 'FINISHED'), [items, filter]);
  if (loadError) return <ErrorState message={loadError} />;
  if (!items) return <Loading />;
  return <div className="page">
    <div className="page-heading"><span className="eyebrow">КАЛЕНДАРЬ КЛУБА</span><h1>Игры</h1><p>Все турниры текущего сезона</p></div>
    {notice && <div className="games-notice"><Check size={16} />{notice}</div>}
    {actionError && <div className="games-notice error"><X size={16} />{actionError}<button onClick={() => setActionError(null)}>Закрыть</button></div>}
    <div className="segmented"><button className={filter === 'upcoming' ? 'active' : ''} onClick={() => setFilter('upcoming')}>Предстоящие</button><button className={filter === 'finished' ? 'active' : ''} onClick={() => setFilter('finished')}>Завершённые</button></div>
    <div className="games-list">
      {filtered?.map((game) => {
        const date = tournamentDate(game.startsAt);
        const registrationAvailable = (game.status === 'UPCOMING' || game.status === 'ACTIVE') && !game.registrationClosed && (!game.registrationDeadline || new Date(game.registrationDeadline) > new Date());
        const canCancel = game.status === 'UPCOMING' && (game.registration?.status === 'REGISTERED' || game.registration?.status === 'WAITLISTED');
        return <article className="game-card card" key={game.id}>
          <div className="game-card-head"><div className="date-tile"><strong>{date.day}</strong><span>{date.month}</span></div><span className={`status status-${game.status.toLowerCase()}`}>{game.status === 'FINISHED' && <Check size={13} />}{labels[game.status]}</span></div>
          <h2>{game.title}</h2><p>{game.description}</p>
          <div className="game-meta"><span><Clock3 size={16} />{date.time}</span><span><Users size={16} />{game.participantCount || game._count?.results || 0}/{game.capacity}</span>{game.location && <span><MapPin size={16} />{game.location}</span>}</div>
          {(game.status === 'UPCOMING' || game.status === 'ACTIVE') && <div className={`registration-box registration-${game.registration?.status?.toLowerCase() ?? 'open'}`}>
            {game.registration && game.registration.status !== 'CANCELLED' ? <>
              <span>{game.registration.status === 'WAITLISTED' ? <ListOrdered /> : <UserCheck />}</span>
              <div><strong>{game.registration.status === 'WAITLISTED' ? 'Вы в листе ожидания' : game.registration.status === 'CHECKED_IN' || game.registration.status === 'PLAYED' ? 'Присутствие подтверждено' : 'Вы участвуете'}</strong><small>{game.registration.status === 'WAITLISTED' ? `Позиция в очереди: ${game.registration.waitlistPosition ?? '—'}` : game.registration.status === 'CHECKED_IN' || game.registration.status === 'PLAYED' ? 'Чек-ин зафиксирован и не отменяется' : game.status === 'ACTIVE' ? 'Поздняя регистрация подтверждена' : 'Место в основном списке подтверждено'}</small></div>
              {canCancel && <button disabled={savingId === game.id} onClick={() => void cancel(game)} aria-label="Отменить участие"><X size={15} />Отменить</button>}
            </> : <>
              <span><UserCheck /></span><div><strong>{!registrationAvailable ? 'Регистрация закрыта' : game.participantCount >= game.capacity ? 'Основной список заполнен' : game.status === 'ACTIVE' ? 'Поздняя регистрация' : 'Записаться на турнир'}</strong><small>{!registrationAvailable ? 'Администратор остановил приём участников' : game.participantCount >= game.capacity ? 'Вы попадёте в лист ожидания' : game.status === 'ACTIVE' ? 'Турнир уже начался, но присоединиться ещё можно' : `Свободно мест: ${Math.max(0, game.capacity - game.participantCount)}`}</small></div>
              <button className="join-game" disabled={savingId === game.id || !registrationAvailable} onClick={() => void register(game)}>{savingId === game.id ? 'Подождите…' : game.participantCount >= game.capacity ? 'В очередь' : 'Участвовать'}</button>
            </>}
          </div>}
        </article>;
      })}
      {!filtered?.length && <div className="empty-card card"><CalendarDays size={28} /><strong>Турниров пока нет</strong><span>Администратор добавит расписание</span></div>}
    </div>
  </div>;
}
