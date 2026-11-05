import React, { useEffect, useState } from 'react';
import { joinGroup } from '../api';
import { navigate } from '../lib/router';
import { Spinner, ErrorBanner } from '../components/ui';

export default function JoinPage() {
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (!code) {
      navigate('/family');
      return;
    }

    let active = true;
    (async () => {
      try {
        await joinGroup(code.trim().toUpperCase());
        if (active) {
          navigate('/family');
        }
      } catch (err) {
        if (active) {
          setError(err);
          setJoining(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="card card-pad max-w-md mx-auto my-12 text-center space-y-4">
      {joining ? (
        <div className="py-8 space-y-3">
          <Spinner className="w-8 h-8 text-tomato-600 mx-auto" />
          <p className="font-bold text-ink">Joining family group...</p>
        </div>
      ) : (
        <div className="space-y-4 py-4">
          <h3 className="font-display font-extrabold text-lg text-ink">Unable to Join Group</h3>
          {error && <ErrorBanner error={error} />}
          <button
            type="button"
            onClick={() => navigate('/family')}
            className="btn-primary text-xs py-2 px-4"
          >
            Go to Family Page
          </button>
        </div>
      )}
    </div>
  );
}
