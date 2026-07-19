export function Loading({ label = 'Загружаем клуб…' }: { label?: string }) {
  return <div className="state-screen"><span className="loader" /><p>{label}</p></div>;
}

export function ErrorState({ message }: { message: string }) {
  return <div className="state-screen"><div className="state-icon">!</div><h2>Что-то пошло не так</h2><p>{message}</p></div>;
}
