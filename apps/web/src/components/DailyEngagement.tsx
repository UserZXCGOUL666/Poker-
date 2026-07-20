import { Brain, CheckCircle2, Coins, Lightbulb, Sparkles, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, post } from '../lib/api';
import type { DailyContent } from '../types';

function PlayingCard({ value }: { value: string }) {
  const red = value.includes('♥') || value.includes('♦');
  return <span className={`playing-card ${red ? 'red' : ''}`}>{value}</span>;
}

export function DailyEngagement() {
  const [data, setData] = useState<DailyContent | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<DailyContent>('/loyalty/daily').then((value) => {
      setData(value);
      if (value.tip) localStorage.setItem('poker-club-daily-tip', JSON.stringify({ ...value.tip, dayKey: value.dayKey }));
    }).catch(() => undefined);
  }, []);

  async function answer(optionId: string) {
    if (!data?.hand || data.hand.attempt || saving) return;
    setSaving(true); setError(null);
    try {
      const next = await post<DailyContent>('/loyalty/daily/answer', { optionId });
      setData(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить ответ'); }
    finally { setSaving(false); }
  }

  if (!data || (!data.tip && !data.hand)) return null;
  const attempt = data.hand?.attempt;
  return <section className="daily-engagement">
    <div className="loyalty-strip"><span><Sparkles /></span><div><small>КЛУБНЫЕ БОНУСЫ</small><strong>{data.clubXp.toLocaleString('ru-RU')} Club XP</strong></div></div>
    {data.tip && <article className="daily-tip-card card"><span><Lightbulb /></span><div><small>{data.tip.category} · СОВЕТ ДНЯ</small><h3>{data.tip.title}</h3><p>{data.tip.body}</p></div></article>}
    {data.hand && <article className="daily-hand-card card">
      <header><span><Brain /></span><div><small>РАЗДАЧА ДНЯ · {data.hand.difficulty}</small><h3>{data.hand.title}</h3></div><em>+{data.hand.rewardXp} XP</em></header>
      <p>{data.hand.scenario}</p>
      <div className="hand-cards"><div><small>ВАША РУКА</small><span>{data.hand.heroCards.map((card) => <PlayingCard key={card} value={card} />)}</span></div>{data.hand.boardCards.length > 0 && <div><small>ДОСКА</small><span>{data.hand.boardCards.map((card) => <PlayingCard key={card} value={card} />)}</span></div>}</div>
      <div className="hand-options">{data.hand.options.map((option) => {
        const selected = attempt?.selectedOptionId === option.id;
        const correct = attempt?.correctOptionId === option.id;
        return <button key={option.id} disabled={Boolean(attempt) || saving} className={attempt ? correct ? 'correct' : selected ? 'wrong' : '' : ''} onClick={() => void answer(option.id)}><span>{correct ? <CheckCircle2 /> : selected && attempt ? <XCircle /> : null}</span><strong>{option.label}</strong>{attempt && (selected || correct) && option.explanation && <small>{option.explanation}</small>}</button>;
      })}</div>
      {attempt && <div className={`hand-result ${attempt.isCorrect ? 'success' : 'miss'}`}><Coins />{attempt.isCorrect ? `Верно! Начислено ${attempt.awardedXp} Club XP.` : 'Сегодня без награды. Новая раздача появится завтра.'}</div>}
      {error && <div className="form-error">{error}</div>}
    </article>}
  </section>;
}
