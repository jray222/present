import React, { useState } from 'react';

export default function ProductImage({
  src,
  className = '',
  placeholderClassName = '',
  isClaimed = false,
}) {
  const [prevSrc, setPrevSrc] = useState(src);
  const [imgSrc, setImgSrc] = useState(() => (src?.startsWith('http://') ? 'https://' + src.slice(7) : src));
  const [failed, setFailed] = useState(!src);
  const [triedProxy, setTriedProxy] = useState(false);

  // Synchronize state during render when prop changes (React-recommended pattern)
  if (src !== prevSrc) {
    setPrevSrc(src);
    setFailed(!src);
    setTriedProxy(false);
    setImgSrc(src?.startsWith('http://') ? 'https://' + src.slice(7) : src);
  }

  const handleError = () => {
    // If direct load failed and we haven't tried the backend proxy yet, try the proxy
    if (!triedProxy && src && !src.startsWith('/api/images/proxy')) {
      setTriedProxy(true);
      setImgSrc(`/api/images/proxy?url=${encodeURIComponent(src)}`);
    } else {
      // Both direct and proxy failed -> fall back cleanly to icon placeholder
      setFailed(true);
    }
  };

  if (failed || !imgSrc) {
    return (
      <div
        className={`w-full h-full flex items-center justify-center bg-sunk/60 select-none ${placeholderClassName}`}
        aria-hidden="true"
      >
        <span className="text-4xl">🎁</span>
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt=""
      role="presentation"
      referrerPolicy="no-referrer"
      onError={handleError}
      className={`${className} ${isClaimed ? 'grayscale-[40%]' : ''}`}
      loading="lazy"
    />
  );
}
