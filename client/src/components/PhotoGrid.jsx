import React, { useState } from 'react'
import Lightbox from './Lightbox'

export default function PhotoGrid({ photos, onRemove, readOnly = false }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)

  if (!photos || photos.length === 0) return null

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
        {photos.map((src, i) => (
          <div key={i} className="relative group aspect-square rounded-lg overflow-hidden bg-raptor-input border border-raptor-border">
            <button
              type="button"
              className="w-full h-full focus:outline-none"
              onClick={() => setLightboxIndex(i)}
              aria-label={`View photo ${i + 1}`}
            >
              <img
                src={src}
                alt={`Photo ${i + 1}`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
            </button>
            {onRemove && !readOnly && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onRemove(i) }}
                className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs hover:bg-red-700"
                aria-label="Remove photo"
              >
                ×
              </button>
            )}
            {/* Expand hint */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="bg-black/50 rounded-full p-1.5">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}
