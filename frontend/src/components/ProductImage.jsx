import React, { useState, useEffect } from 'react';

export default function ProductImage({
  src,
  className = '',
  placeholderClassName = '',
  isClaimed = false,
}) {
  const [imgSrc, setImgSrc] = useState(src);
  const [failed, setFailed] = useState(!src);
  const [triedProxy, setTriedProxy] = useState(false);

  useEffect(() => {
    // If src changes, reset state
    if (!src) {
      setFailed(true);
      setImgSrc(null);
    } else {
      setFailed(false);
      setTriedProxy(false);
      // Auto-upgrade insecure http to https
      const cleanSrc = src.startsWith('http://') ? 'https://' + src.slice(7) : src;
      setImgSrc(cleanSrc);
    }
  }, [src]);

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
