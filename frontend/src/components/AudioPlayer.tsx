import { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface Props {
  recordingId: string;
}

export default function AudioPlayer({ recordingId }: Props) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Revoke the object URL when the component unmounts or the recordingId changes
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const url = await api.fetchAudio(recordingId);
      setAudioUrl(url);
    } catch {
      setError('Could not load audio');
    } finally {
      setLoading(false);
    }
  }

  if (error) {
    return (
      <span className="text-red-500 text-sm">{error}</span>
    );
  }

  if (!audioUrl) {
    return (
      <button
        onClick={load}
        disabled={loading}
        className="text-brand-600 text-sm underline underline-offset-2 hover:text-brand-800
                   disabled:opacity-50 disabled:cursor-wait"
      >
        {loading ? 'Loading…' : 'Load audio'}
      </button>
    );
  }

  return (
    <audio
      src={audioUrl}
      controls
      className="w-full rounded-lg max-w-sm"
      aria-label="Recorded audio"
    />
  );
}
