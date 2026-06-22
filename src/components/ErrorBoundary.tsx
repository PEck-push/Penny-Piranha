import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

// Fängt Render-Fehler ab, damit ein einzelner kaputter Screen nicht die ganze
// App schwarz macht. Zeigt eine Meldung + Reload statt eines leeren Bildschirms.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-bg text-center px-8 gap-4">
          <div className="text-[40px]">🛠️</div>
          <div className="text-[16px] font-black text-white">Hoppla — da ist etwas schiefgelaufen.</div>
          <div className="text-[12px] text-muted max-w-[280px]">
            Diese Ansicht konnte nicht geladen werden. Lade die Seite neu — deine Daten sind sicher.
          </div>
          <button
            onClick={() => { this.setState({ error: null }); window.location.assign('/dashboard'); }}
            className="mt-2 px-5 py-3 rounded-xl bg-gradient-to-r from-purple2 to-blue2 text-white font-black text-[13px]">
            Zurück zum Dashboard
          </button>
          <button
            onClick={() => window.location.reload()}
            className="text-[11px] text-muted underline">
            Seite neu laden
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
