import { useState } from 'react';

interface FlipCardProps {
  ebayImage: string | null;
  refImage: string | null;
  name: string;
  tierBorder?: string;
}

export default function FlipCard({
  ebayImage,
  refImage,
  name,
  tierBorder = '#7c3aed',
}: FlipCardProps) {
  const [flipped, setFlipped] = useState(false);

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.1em',
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: 'uppercase',
    textAlign: 'center',
    padding: '3px 10px',
    borderRadius: 4,
  };

  return (
    <div
      style={{
        width: '100%',
        margin: '14px 0 8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* Active label */}
      <div
        style={{
          ...labelStyle,
          color: flipped ? '#60a5fa' : '#facc15',
          background: flipped ? 'rgba(59,130,246,0.12)' : 'rgba(250,204,21,0.12)',
          border: `1px solid ${flipped ? 'rgba(59,130,246,0.25)' : 'rgba(250,204,21,0.25)'}`,
          marginBottom: 8,
          transition: 'all 0.3s ease',
        }}
      >
        {flipped ? 'SCRYDEX REF' : 'EBAY LISTING'}
      </div>

      {/* Flip container */}
      <div
        onClick={() => setFlipped((f) => !f)}
        role="button"
        tabIndex={0}
        aria-label={`Viewing ${flipped ? 'Scrydex reference' : 'eBay listing'} image. Click to flip.`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setFlipped((f) => !f);
          }
        }}
        style={{
          width: 160,
          aspectRatio: '5 / 7',
          perspective: '800px',
          cursor: 'pointer',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            transition: 'transform 0.5s cubic-bezier(0.4, 0.0, 0.2, 1)',
          }}
        >
          {/* Front — eBay listing */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              borderRadius: 10,
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${tierBorder}22`,
            }}
          >
            {ebayImage ? (
              <img
                src={ebayImage}
                alt={`${name} eBay listing`}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  filter: 'brightness(0.95) contrast(1.05)',
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(255,255,255,0.2)',
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                No image
              </div>
            )}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.2) 100%)',
                pointerEvents: 'none',
              }}
            />
          </div>

          {/* Back — Scrydex reference */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              borderRadius: 10,
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(59,130,246,0.2)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(59,130,246,0.15)',
            }}
          >
            {(refImage || ebayImage) ? (
              <img
                src={refImage || ebayImage || ''}
                alt={`${name} Scrydex reference`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(255,255,255,0.2)',
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                No ref
              </div>
            )}
          </div>
        </div>

        {/* Glow */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '120%',
            height: '120%',
            borderRadius: 24,
            background: `radial-gradient(ellipse, ${flipped ? 'rgba(59,130,246,0.08)' : `${tierBorder}12`}, transparent 70%)`,
            zIndex: -1,
            filter: 'blur(12px)',
            pointerEvents: 'none',
            transition: 'background 0.5s ease',
          }}
        />
      </div>

      {/* Hint */}
      <div
        style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.18)',
          textAlign: 'center',
          fontFamily: "'IBM Plex Sans', sans-serif",
          fontStyle: 'italic',
          marginTop: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 13, opacity: 0.5 }}>↻</span>
        Tap to flip · verify visually
      </div>
    </div>
  );
}
