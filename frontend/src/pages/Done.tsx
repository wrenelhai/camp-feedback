import { useLocation } from 'react-router-dom';

interface LocationState {
  sessionName?: string;
  count?: number;
}

export default function Done() {
  const location = useLocation();
  const state = location.state as LocationState | null;
  const sessionName = state?.sessionName ?? 'Miles of Music Camp';
  const count = state?.count ?? 0;

  return (
    <div className="page-container">
      <div className="page-content items-center justify-center text-center gap-6 py-16">
        {/* Thank-you icon */}
        <div className="w-24 h-24 rounded-full bg-brand-50 flex items-center justify-center">
          <svg
            className="w-12 h-12 text-brand-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="10" />
          </svg>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">You're all done!</h1>
          <p className="text-gray-600 leading-relaxed max-w-sm">
            Thanks for sharing your feedback from {sessionName}.
            {count > 0 && (
              <> You answered {count} question{count !== 1 ? 's' : ''}.</>
            )}{' '}
            Your responses will help shape future camps.
          </p>
        </div>

        <div className="card text-sm text-gray-500 max-w-sm">
          <p>
            Your recordings are being uploaded in the background. You can safely close this tab.
          </p>
        </div>

        <p className="text-xs text-gray-400 max-w-xs">
          🎵 See you next year at Miles of Music Camp!
        </p>
      </div>
    </div>
  );
}
